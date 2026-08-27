-- =============================================================================
--  JOB-058 / JOB-059 — emporter ses données, ou les effacer.
--
--  REQ-014 : « une suppression annule D'ABORD toute automatisation en cours ;
--  aucun envoi ne peut partir pour un compte en cours de suppression ».
--
--  ── Pourquoi « en cours de suppression » est un ÉTAT, et pas un instant ──
--
--  Une suppression n'est pas atomique. Il y a un moment — quelques secondes,
--  parfois plus si le worker est chargé — entre « la personne a cliqué » et
--  « les données sont parties. » Pendant ce moment, un travail déjà en file
--  peut arriver à son point d'exécution.
--
--  Sans état, la course se joue ainsi : la personne demande la suppression, un
--  envoi part à un recruteur, et les données qui prouvaient ce qui est parti
--  sont effacées trois secondes plus tard. Elle ne saura jamais qu'une
--  candidature a été envoyée en son nom après qu'elle a demandé à tout effacer.
--
--  `suppression_demandee_le` ferme cette fenêtre : dès qu'elle est posée,
--  `peutEnvoyer` refuse — avant tout le reste, comme l'arrêt d'urgence.
--
--  ── Et l'export n'est pas une faveur ──
--
--  « Export en libre-service, complet et lisible par une machine, en moins de
--  24 h. » Les trois qualificatifs comptent : en LIBRE-SERVICE (pas une demande
--  au support), COMPLET (pas un résumé), LISIBLE PAR UNE MACHINE (pas un PDF
--  qu'il faudrait retaper pour changer d'outil).
-- =============================================================================

alter table public.profiles
  -- Non nul = suppression demandée. Rien ne part, et la personne peut encore
  -- annuler tant que l'effacement n'a pas commencé.
  add column suppression_demandee_le timestamptz,
  add column suppression_effectuee_le timestamptz;

comment on column public.profiles.suppression_demandee_le is
  'Non nul = plus aucun envoi, avant tout le reste. Sans cet état, un travail déjà en file pourrait partir pendant les secondes qui séparent la demande de l effacement — et les données qui le prouvaient partiraient juste après.';

-- --------------------------------------------------------------------------
--  L'export, en une seule fonction.
--
--  Elle s'exécute avec les droits de l'APPELANT : la RLS s'applique, donc
--  personne n'exporte le profil d'autrui. Une fonction `security definer` ici
--  serait un contournement de tout ce qui précède, offert sous couvert d'un
--  droit de la personne.
-- --------------------------------------------------------------------------
create or replace function public.exporter_mes_donnees()
returns jsonb
language plpgsql
as $$
declare
  v_profile_id uuid;
  v_sortie jsonb;
begin
  select id into v_profile_id from public.profiles where user_id = (select auth.uid());
  if v_profile_id is null then
    raise exception 'aucun profil pour cette identité';
  end if;

  select jsonb_build_object(
    'exporte_le', now(),
    'format', 'job-seeker/export/1',
    'profil', (select to_jsonb(p) from public.profiles p where p.id = v_profile_id),
    'experiences', coalesce((select jsonb_agg(to_jsonb(e)) from public.experiences e where e.profile_id = v_profile_id), '[]'::jsonb),
    'formations', coalesce((select jsonb_agg(to_jsonb(f)) from public.formations f where f.profile_id = v_profile_id), '[]'::jsonb),
    'competences', coalesce((select jsonb_agg(to_jsonb(c)) from public.competences c where c.profile_id = v_profile_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(d)) from public.documents d where d.profile_id = v_profile_id), '[]'::jsonb),
    'criteres', coalesce((select jsonb_agg(to_jsonb(k)) from public.criteres_recherche k where k.profile_id = v_profile_id), '[]'::jsonb),
    'employeurs_exclus', coalesce((select jsonb_agg(to_jsonb(x)) from public.employeurs_exclus x where x.profile_id = v_profile_id), '[]'::jsonb),
    'reponses', coalesce((select jsonb_agg(to_jsonb(r)) from public.reponses_reference r where r.profile_id = v_profile_id), '[]'::jsonb),
    'opportunites', coalesce((select jsonb_agg(to_jsonb(o)) from public.opportunites o where o.profile_id = v_profile_id), '[]'::jsonb),
    'candidatures', coalesce((select jsonb_agg(to_jsonb(c)) from public.candidatures c where c.profile_id = v_profile_id), '[]'::jsonb),
    'mandats', coalesce((select jsonb_agg(to_jsonb(m)) from public.mandats m where m.profile_id = v_profile_id), '[]'::jsonb),
    -- Les REÇUS sont dans l'export, et c'est le point le plus important de
    -- cette fonction. Ils sont la preuve de ce qui est parti au nom de la
    -- personne : un export qui les omettrait rendrait tout sauf ce qui compte.
    'recus', coalesce((select jsonb_agg(to_jsonb(u)) from public.recus u where u.profile_id = v_profile_id), '[]'::jsonb),
    'versions_profil', coalesce((select jsonb_agg(to_jsonb(v)) from public.profil_versions v where v.profile_id = v_profile_id), '[]'::jsonb),
    -- Son propre journal d'audit : qui a accédé à ses données, support compris.
    'journal_acces', coalesce((select jsonb_agg(to_jsonb(a)) from audit.acces a where a.profile_id = v_profile_id), '[]'::jsonb)
  ) into v_sortie;

  return v_sortie;
end;
$$;

comment on function public.exporter_mes_donnees is
  'S exécute avec les droits de l APPELANT : la RLS s applique. Une fonction security definer ici serait un contournement de tout ce qui précède, offert sous couvert d un droit de la personne.';

grant execute on function public.exporter_mes_donnees() to authenticated;

-- --------------------------------------------------------------------------
--  La demande de suppression. Elle ARRÊTE, elle n'efface pas.
-- --------------------------------------------------------------------------
create or replace function public.demander_ma_suppression()
returns timestamptz
language plpgsql
as $$
declare
  v_profile_id uuid;
  v_le timestamptz := now();
begin
  select id into v_profile_id from public.profiles where user_id = (select auth.uid());
  if v_profile_id is null then
    raise exception 'aucun profil pour cette identité';
  end if;

  -- L'arrêt d'urgence EN MÊME TEMPS. Deux garanties valent mieux qu'une quand
  -- la seconde coûte une colonne : si un chemin de code oubliait de consulter
  -- `suppression_demandee_le`, il consulterait `arret_urgence_le`.
  update public.profiles
     set suppression_demandee_le = coalesce(suppression_demandee_le, v_le),
         arret_urgence_le = coalesce(arret_urgence_le, v_le)
   where id = v_profile_id;

  return v_le;
end;
$$;

comment on function public.demander_ma_suppression is
  'ARRÊTE, n efface pas. Pose aussi l arrêt d urgence : si un chemin de code oubliait de consulter suppression_demandee_le, il consulterait arret_urgence_le.';

grant execute on function public.demander_ma_suppression() to authenticated;

create or replace function public.annuler_ma_suppression()
returns void
language plpgsql
as $$
begin
  -- Annulable tant que l effacement n a pas commencé. Une demande de
  -- suppression faite par erreur, ou sous le coup d une décision qu on
  -- regrette, doit pouvoir être reprise — sinon la fenêtre de réflexion
  -- n existe que pour ceux qui savent qu elle existe.
  update public.profiles
     set suppression_demandee_le = null, arret_urgence_le = null
   where user_id = (select auth.uid())
     and suppression_effectuee_le is null;
end;
$$;

grant execute on function public.annuler_ma_suppression() to authenticated;
