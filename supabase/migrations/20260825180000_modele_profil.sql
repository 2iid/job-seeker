-- =============================================================================
--  JOB-030 — profil canonique, documents, criteres, candidatures.
--
--  Chaque table porte de la donnee personnelle, donc chaque table active ET
--  force la RLS, avec une regle PAR OPERATION. Le defaut est le refus.
--
--  Deux choix de modele qui ne sont pas des details :
--
--  1. Les criteres de recherche sont VERSIONNES et en insertion seule. REQ-002
--     exige de pouvoir expliquer a posteriori pourquoi une offre a matche a un
--     instant donne. Un UPDATE effacerait cette explication ; une nouvelle
--     version la conserve. Il n y a donc aucune politique UPDATE sur cette
--     table, et c est deliberé.
--
--  2. Aucune table ne donne DELETE a un role client. La suppression passe par
--     le parcours de suppression de compte (REQ-014), qui doit d abord ARRETER
--     l automatisation. Un DELETE direct court-circuiterait cette garantie.
-- =============================================================================

-- --------------------------------------------------------------------------
--  profiles : on complete la table minimale posee par JOB-004.
-- --------------------------------------------------------------------------
alter table public.profiles
  add column titre_accroche text,
  add column locale text not null default 'fr' check (locale in ('fr', 'en')),
  add column fuseau text not null default 'Europe/Paris',
  add column autorisation_travail text[] not null default '{}';

comment on column public.profiles.autorisation_travail is
  'Codes pays ou la personne peut travailler sans demarche. Critere REDHIBITOIRE (REQ-005) : une offre hors de cette liste ne part jamais en automatique.';

comment on column public.profiles.fuseau is
  'Fuseau du candidat. Les plages horaires de l agent (REQ-009) et l age affiche d une offre (REQ-004) s y expriment.';

-- --------------------------------------------------------------------------
--  Le parcours : experiences, formations, competences.
-- --------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  employeur text not null,
  intitule text not null,
  lieu text,
  debut date not null,
  fin date,
  description text,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_apres_debut check (fin is null or fin >= debut)
);

create table public.formations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  etablissement text not null,
  intitule text not null,
  obtenue_en integer check (obtenue_en between 1950 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  libelle text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, libelle)
);

-- --------------------------------------------------------------------------
--  documents : le CV et ce qui est genere a partir de lui.
-- --------------------------------------------------------------------------
create type public.genre_document as enum ('cv_source', 'cv_adapte', 'lettre', 'autre');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  genre public.genre_document not null,
  nom_origine text,
  chemin_stockage text not null,
  type_mime text not null,
  taille_octets integer not null check (taille_octets > 0 and taille_octets <= 10 * 1024 * 1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.documents.taille_octets is
  'Plafond a 10 Mo, aligne sur REQ-001 : au-dela, l import est refuse avec un message qui dit quoi faire.';

-- --------------------------------------------------------------------------
--  criteres_recherche : VERSIONNES, en insertion seule.
-- --------------------------------------------------------------------------
create table public.criteres_recherche (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  version integer not null,
  intitules text[] not null default '{}',
  seniorite text,
  presence text[] not null default '{}',
  zones text[] not null default '{}',
  salaire_min_unites_mineures bigint,
  salaire_devise text,
  secteurs text[] not null default '{}',
  langues text[] not null default '{}',
  mots_redhibitoires text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (profile_id, version)
);

comment on table public.criteres_recherche is
  'Insertion seule et versionne : REQ-002 exige d expliquer a posteriori pourquoi une offre a matche a un instant donne. Un UPDATE effacerait cette explication.';

create table public.employeurs_exclus (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  employeur_canonique text not null,
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, employeur_canonique)
);

comment on table public.employeurs_exclus is
  'Une offre d un employeur exclu n est JAMAIS presentee, jamais scoree, jamais soumise (REQ-002).';

-- --------------------------------------------------------------------------
--  candidatures : le pipeline de REQ-015, dans le langage du systeme de design.
-- --------------------------------------------------------------------------
create type public.etat_candidature as enum (
  'detectee', 'en_file', 'escalade', 'envoyee', 'consultee',
  'entretien', 'offre', 'sans_reponse', 'refusee', 'echec_technique'
);

create table public.candidatures (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  employeur text not null,
  intitule text not null,
  url_offre text not null,
  source text not null,
  palier char(1) not null check (palier in ('a', 'b', 'c')),
  offre_publiee_le timestamptz,
  score smallint check (score between 0 and 100),
  etat public.etat_candidature not null default 'detectee',
  etat_depuis timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, url_offre)
);

comment on column public.candidatures.etat_depuis is
  'Depuis quand la candidature est dans cet etat. « Envoyee » ne dit rien ; « envoyee depuis 3 jours » dit s il faut relancer.';

comment on constraint candidatures_profile_id_url_offre_key on public.candidatures is
  'Anti-doublon : la meme offre ne peut pas produire deux candidatures pour la meme personne (REQ-011).';

-- --------------------------------------------------------------------------
--  RLS : refus par defaut, une regle par operation, sur CHAQUE table.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'experiences', 'formations', 'competences', 'documents',
    'criteres_recherche', 'employeurs_exclus', 'candidatures'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE : sans lui, le proprietaire de la table et toute fonction
    -- SECURITY DEFINER contournent les politiques.
    execute format('alter table public.%I force row level security', t);

    -- La sous-requete sur profiles est elle-meme soumise a la RLS de profiles :
    -- une ligne dont le profil n appartient pas a l appelant est invisible, donc
    -- la condition est fausse. L appartenance se prouve, elle ne se declare pas.
    execute format($p$
      create policy %1$s_select_mien on public.%1$I for select to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);

    execute format($p$
      create policy %1$s_insert_mien on public.%1$I for insert to authenticated
        with check (exists (select 1 from public.profiles p
                             where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);

    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create trigger %1$s_set_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- UPDATE : accorde partout SAUF sur les criteres, qui sont versionnes.
do $$
declare t text;
begin
  foreach t in array array[
    'experiences', 'formations', 'competences', 'documents',
    'employeurs_exclus', 'candidatures'
  ]
  loop
    execute format($p$
      create policy %1$s_update_mien on public.%1$I for update to authenticated
        using (exists (select 1 from public.profiles p
                        where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
        with check (exists (select 1 from public.profiles p
                             where p.id = %1$I.profile_id and p.user_id = (select auth.uid())))
    $p$, t);
    execute format('grant update on public.%I to authenticated', t);
  end loop;
end $$;

-- criteres_recherche n a volontairement AUCUN trigger updated_at ni politique
-- UPDATE : une version ne se modifie pas, on en ecrit une nouvelle.
drop trigger criteres_recherche_set_updated_at on public.criteres_recherche;
