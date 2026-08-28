-- =============================================================================
--  JOB-065 — l'export suit le schéma, deuxième fois.
--
--  Le test de complétude ajouté avec JOB-055 a fait son travail : il a refusé
--  la livraison tant que `contacts` manquait à l'export. C'était l'objet même
--  de ce test — « complet » est une propriété qui se dégrade seule à chaque
--  migration, et il faut quelque chose qui le remarque avant un humain.
--
--  Fonction DÉRIVÉE de la précédente, ligne à ligne, jamais retapée.
-- =============================================================================

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
    -- Ses recherches enregistrées. Absentes de l'export depuis leur création :
    -- c'est le TROISIÈME manque qu'a trouvé le test de complétude, et celui que
    -- personne n'aurait cherché — la table date d'un autre sprint.
    'recherches_sauvegardees', coalesce((select jsonb_agg(to_jsonb(rs)) from public.recherches_sauvegardees rs where rs.profile_id = v_profile_id), '[]'::jsonb),
    -- JOB-049 : ce que le produit a préparé en son nom, y compris ce qui n'est
    -- jamais parti. Sur les canaux ATS, c'est même l'essentiel du travail fait.
    'dossiers', coalesce((select jsonb_agg(to_jsonb(dd)) from public.dossiers dd where dd.profile_id = v_profile_id), '[]'::jsonb),
    -- JOB-055 : ce que le produit ne SAIT PAS. Retenir cela reviendrait à
    -- retenir l'information qu'elle aurait le plus de raisons d'emporter.
    'incidents', coalesce((select jsonb_agg(to_jsonb(i)) from public.incidents i where i.profile_id = v_profile_id), '[]'::jsonb),
    -- JOB-065 : les contacts recruteurs identifiés pour ses candidatures.
    -- Données de TIERS (OBL-3) : elles figurent dans son export parce qu'elle
    -- les voit déjà à l'écran, et qu'un export incomplet serait une deuxième
    -- vérité sur les mêmes données.
    'contacts', coalesce((select jsonb_agg(to_jsonb(ct)) from public.contacts ct where ct.profile_id = v_profile_id), '[]'::jsonb),
    'versions_profil', coalesce((select jsonb_agg(to_jsonb(v)) from public.profil_versions v where v.profile_id = v_profile_id), '[]'::jsonb),
    -- Son propre journal d'audit : qui a accédé à ses données, support compris.
    'journal_acces', coalesce((select jsonb_agg(to_jsonb(a)) from audit.acces a where a.profile_id = v_profile_id), '[]'::jsonb)
  ) into v_sortie;

  return v_sortie;
end;
$$;

comment on function public.exporter_mes_donnees is
  'S exécute avec les droits de l APPELANT : la RLS s applique. Une fonction security definer ici serait un contournement de tout ce qui précède, offert sous couvert d un droit de la personne.';
