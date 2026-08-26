-- =============================================================================
--  Socle. JOB-004 (première migration) et JOB-005 (RLS deny-by-default).
--
--  Deux règles de ce dépôt, posées ici parce qu'une convention non écrite au
--  premier commit n'existe pas :
--
--   1. Une migration livrée ne se modifie JAMAIS. On en écrit une nouvelle.
--   2. Toute table portant des données d'utilisateur active la RLS et n'ouvre
--      l'accès que par une règle explicite, PAR OPÉRATION. Le défaut est le
--      refus, y compris pour une table qu'on aurait oublié de configurer :
--      RLS activée sans aucune politique = personne ne lit rien.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- --------------------------------------------------------------------------
--  updated_at : tenu par la base, jamais par l'appelant.
--  Un horodatage que le client peut écrire est un horodatage qui ment.
-- --------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger BEFORE UPDATE : impose updated_at côté base. search_path vide pour empêcher le détournement par un schéma injecté.';

-- --------------------------------------------------------------------------
--  profiles — le strict minimum pour que l'authentification et la RLS aient
--  quelque chose à protéger. Le modèle complet appartient à JOB-030 ; cette
--  table est délibérément pauvre pour ne pas préempter ses décisions.
-- --------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Un profil par compte. Porte de la donnée personnelle : RLS obligatoire (OBL-1, REQ-014).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
--  RLS : refus par défaut, puis une règle par opération.
--  Pas de politique « for all » : elle rend indistinguables lecture et
--  écriture, et c'est en écriture que les erreurs coûtent cher.
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
-- FORCE : même le propriétaire de la table subit la RLS. Sans cela, un
-- changement de propriétaire ou une fonction SECURITY DEFINER contourne tout.
alter table public.profiles force row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Pas de politique DELETE : la suppression passe par le parcours de
-- suppression de compte (REQ-014), qui doit d'abord arrêter l'automatisation.
-- Une suppression directe par le client court-circuiterait cette garantie.

-- --------------------------------------------------------------------------
--  Le rôle anonyme n'a rien à faire ici, et on le dit explicitement plutôt
--  que de compter sur l'absence de politique.
-- --------------------------------------------------------------------------
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
