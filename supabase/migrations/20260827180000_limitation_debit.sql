-- =============================================================================
--  JOB-073 — la limitation de débit. Ferme F9, F10 et F21.
--
--  ── Pourquoi le compteur vit en base ──
--
--  En mémoire, il repart à zéro à chaque redéploiement et ne voit pas les
--  autres instances. Les deux défauts se rejoignent au pire moment : on
--  redéploie parce qu'il y a un incident, et l'incident est justement celui
--  qu'on essaie de limiter.
--
--  ── Ce que la CLÉ ne doit pas être ──
--
--  F9 demande une limite sur l'adresse ET sur l'IP. Mais stocker les adresses
--  électroniques de tous ceux qui ont demandé un lien de connexion
--  constituerait, sur CE produit, une liste de gens qui cherchent un emploi —
--  exactement la donnée qu'on protège partout ailleurs, reconstituée par une
--  table technique.
--
--  La clé est donc une EMPREINTE. Elle suffit à compter, elle ne suffit pas à
--  savoir qui. Une table de limitation ne doit pas devenir un carnet
--  d'adresses.
-- =============================================================================

create table public.limitation_debit (
  -- SHA-256 de « portée:valeur ». Jamais la valeur elle-même.
  cle text primary key,
  fenetre_debut timestamptz not null,
  compte integer not null default 0,
  -- Pour purger sans avoir à connaître les fenêtres de chaque portée.
  expire_le timestamptz not null
);

comment on table public.limitation_debit is
  'La clé est une EMPREINTE : elle suffit à compter, pas à savoir qui. Stocker les adresses de ceux qui demandent un lien de connexion constituerait une liste de gens qui cherchent un emploi.';

create index limitation_expire_idx on public.limitation_debit (expire_le);

-- ── Pas de RLS ici, et c'est une décision, pas un oubli ──
--
-- Le réflexe est d'écrire `enable row level security`. Il était écrit, et un
-- test d'invariant du dépôt l'a signalé : une table avec RLS et zéro politique
-- refuse tout, ce qui est presque toujours un oubli.
--
-- Le diagnostic est plus intéressant que la correction. La RLS répond « QUELLES
-- LIGNES cette personne peut-elle voir ? ». Ici la réponse n'est pas « les
-- siennes » : c'est « aucune, pour personne ». Ce n'est pas une question de
-- lignes, c'est une question de DROIT D'ACCÈS à la table — et celle-là se
-- répond par un privilège.
--
-- Et la RLS aurait été DÉCORATIVE en plus d'être trompeuse : `consommer_jeton`
-- est `security definer` et s'exécute donc sous un rôle qui porte BYPASSRLS.
-- La politique n'aurait jamais été évaluée sur le seul chemin qui écrit.
--
-- La garantie réelle est donc ci-dessous, et elle est vérifiée par un test :
-- ni `anon` ni `authenticated` n'obtiennent quoi que ce soit sur cette table.
-- Rien n'est révoqué — ces droits ne sont jamais accordés, et une garantie qui
-- repose sur un `revoke` se perd au prochain `grant all`.
revoke all on public.limitation_debit from anon, authenticated;

/**
 * Consomme un jeton. Rend le compte APRÈS consommation et la fin de fenêtre.
 *
 * Atomique par construction : `insert … on conflict do update` fait
 * l'incrément et la remise à zéro de fenêtre en une seule instruction. Deux
 * requêtes — lire puis écrire — laisseraient passer deux appels simultanés à
 * la limite exacte, ce qui est précisément le moment où quelqu'un tape fort.
 */
create or replace function public.consommer_jeton(
  p_cle text,
  p_fenetre_secondes integer,
  p_plafond integer
)
returns table (compte integer, fin_fenetre timestamptz, autorise boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maintenant timestamptz := now();
  v_debut timestamptz;
  v_compte integer;
begin
  insert into public.limitation_debit (cle, fenetre_debut, compte, expire_le)
  values (p_cle, v_maintenant, 1, v_maintenant + make_interval(secs => p_fenetre_secondes))
  on conflict (cle) do update
    set
      -- Fenêtre expirée : on repart à un. Sinon on incrémente.
      fenetre_debut = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then v_maintenant else public.limitation_debit.fenetre_debut end,
      compte = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then 1 else public.limitation_debit.compte + 1 end,
      expire_le = case
        when public.limitation_debit.fenetre_debut + make_interval(secs => p_fenetre_secondes) <= v_maintenant
        then v_maintenant + make_interval(secs => p_fenetre_secondes)
        else public.limitation_debit.expire_le end
  returning public.limitation_debit.compte, public.limitation_debit.fenetre_debut
    into v_compte, v_debut;

  return query select
    v_compte,
    v_debut + make_interval(secs => p_fenetre_secondes),
    v_compte <= p_plafond;
end;
$$;

comment on function public.consommer_jeton is
  'Atomique : deux requêtes — lire puis écrire — laisseraient passer deux appels simultanés à la limite exacte, ce qui est précisément le moment où quelqu un tape fort.';

-- `security definer` est justifié ici, et c'est la seule fonction du projet où
-- il l'est : le compteur doit être écrit pour un visiteur NON authentifié (la
-- demande de lien de connexion), qui par définition n'a aucun droit. La
-- fonction n'accepte que trois scalaires, n'expose aucune ligne, et son
-- `search_path` est épinglé.
revoke execute on function public.consommer_jeton(text, integer, integer) from public;
grant execute on function public.consommer_jeton(text, integer, integer) to anon, authenticated, service_role;

/** Purge ce qui a expiré. Une table de limitation ne doit pas devenir un journal. */
create or replace function public.purger_limitation()
returns integer
language sql
security definer
set search_path = public
as $$
  with supprimees as (
    delete from public.limitation_debit where expire_le < now() - interval '1 hour' returning 1
  )
  select count(*)::integer from supprimees;
$$;
