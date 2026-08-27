-- =============================================================================
--  JOB-049 — la table des dossiers préparés.
--
--  Une nouvelle migration et pas une modification de la précédente : celle-ci
--  ajoute des valeurs à un type énuméré, et Postgres refuse de s'en servir dans
--  la même transaction que celle qui les a créées.
-- =============================================================================

create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  opportunite_id uuid not null references public.opportunites (id) on delete cascade,
  canal public.canal_envoi not null,
  -- Le CONTENU exact préparé. Comme pour les reçus : une référence vers un
  -- document qui bougera ne prouve rien de ce qui a été proposé ce jour-là.
  pieces jsonb not null default '[]'::jsonb,
  -- Ce qui manque, en clair. Un dossier incomplet doit dire QUOI, sinon la
  -- personne ne peut rien faire de l'information « pas prêt ».
  manques jsonb not null default '[]'::jsonb,
  pret boolean not null default false,
  -- L'issue de l'exécution, quand il y en a eu une.
  issue text check (issue in ('prepare', 'envoye', 'refuse', 'incertain')),
  issue_motif text,
  prepare_le timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un seul dossier courant par opportunité et par canal. La contrainte est ce
  -- qui rendra l'idempotence de JOB-051 possible sans table supplémentaire.
  unique (opportunite_id, canal)
);

comment on table public.dossiers is
  'ADR-0003 : sur un canal ATS, ceci est le livrable — pas une étape vers un envoi.';
comment on column public.dossiers.issue is
  'incertain n est pas refuse : « je ne sais pas si c est parti, et je ne reessaierai pas ».';

create index dossiers_profil_idx on public.dossiers (profile_id, updated_at desc);

alter table public.dossiers enable row level security;
alter table public.dossiers force row level security;

create policy dossiers_select_mien on public.dossiers for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- Ni insert, ni update, ni delete pour un client : un dossier est PRÉPARÉ par
-- le worker. Laisser quelqu'un écrire son propre dossier « prêt » viderait de
-- son sens la seule chose que ce statut affirme — que le produit l'a vérifié.
grant select on public.dossiers to authenticated;

-- REQ-014 — le support voit qu'un dossier existe et où il en est, jamais son
-- contenu. Colonne par colonne : `grant select on <table>` donnerait `pieces`,
-- c'est-à-dire le CV et la lettre. Ce n'est pas qu'il ne le fait pas, c'est que
-- Postgres refuse.
grant select (id, profile_id, opportunite_id, canal, pret, issue, issue_motif, prepare_le, updated_at)
  on public.dossiers to support;
create policy dossiers_select_support on public.dossiers for select to support using (true);

create trigger dossiers_touche
  before update on public.dossiers
  for each row execute function public.touche_profil();
