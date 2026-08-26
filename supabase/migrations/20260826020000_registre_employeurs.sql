-- =============================================================================
--  JOB-025 / JOB-026 — le registre d employeurs PARTAGE, et la promotion.
--
--  C est le mecanisme qui rend la veille abordable (ADR-0002) : une entreprise
--  est resolue UNE FOIS pour tout le monde, son board est interroge une fois,
--  et le resultat est diffuse a tous les profils dont les criteres
--  correspondent. Le cout suit le nombre d EMPLOYEURS suivis, pas le nombre d
--  inscrits.
--
--  La frontiere qui compte : worker.employeurs ne contient QUE des donnees
--  publiques d entreprise. Aucune colonne n y designe un utilisateur, et c est
--  verifie par un test — un registre partage qui porterait de la donnee de
--  profil serait un canal de fuite entre comptes.
--
--  Le lien « qui suit qui » vit dans public, sous RLS, parce que lui EST une
--  donnee personnelle : savoir quelles entreprises quelqu un surveille en dit
--  long sur sa recherche.
-- =============================================================================

create table worker.employeurs (
  id uuid primary key default gen_random_uuid(),
  nom_canonique text not null unique,
  nom_affiche text not null,
  site_carriere text,

  -- Board resolu, ou null tant qu on n a rien trouve de publie.
  ats_fournisseur text check (ats_fournisseur in ('greenhouse','ashby','lever','workable','smartrecruiters')),
  ats_slug text,
  palier char(1) not null default 'b' check (palier in ('a','b','c')),

  -- Priorite de relevé : combien de profils visent cet employeur. Denormalise
  -- DELIBEREMENT en simple compteur — le detail, lui, est une donnee
  -- personnelle et reste dans public sous RLS.
  suivi_par integer not null default 0 check (suivi_par >= 0),

  dernier_releve timestamptz,
  dernier_etat text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un employeur de palier A DOIT avoir un board : c est ce qui distingue
  -- « je releve son board toutes les 2 min » de « je l ai croise quelque part ».
  constraint palier_a_exige_un_board
    check (palier <> 'a' or (ats_fournisseur is not null and ats_slug is not null))
);

comment on table worker.employeurs is
  'Registre PARTAGE. Ne contient que des donnees publiques d entreprise : aucune colonne n y designe un utilisateur.';

create index employeurs_a_relever on worker.employeurs (palier, dernier_releve nulls first, suivi_par desc);
create trigger employeurs_set_updated_at before update on worker.employeurs
  for each row execute function public.set_updated_at();

revoke all on worker.employeurs from anon, authenticated;

-- --------------------------------------------------------------------------
--  Qui suit qui : donnee PERSONNELLE, donc dans public et sous RLS.
-- --------------------------------------------------------------------------
create table public.employeurs_suivis (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nom_canonique text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, nom_canonique)
);

comment on table public.employeurs_suivis is
  'Savoir quelles entreprises quelqu un surveille en dit long sur sa recherche : RLS obligatoire.';

alter table public.employeurs_suivis enable row level security;
alter table public.employeurs_suivis force row level security;

create policy employeurs_suivis_select_mien on public.employeurs_suivis for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = employeurs_suivis.profile_id and p.user_id = (select auth.uid())));

create policy employeurs_suivis_insert_mien on public.employeurs_suivis for insert to authenticated
  with check (exists (select 1 from public.profiles p
                       where p.id = employeurs_suivis.profile_id and p.user_id = (select auth.uid())));

create policy employeurs_suivis_update_mien on public.employeurs_suivis for update to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = employeurs_suivis.profile_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p
                       where p.id = employeurs_suivis.profile_id and p.user_id = (select auth.uid())));

grant select, insert, update on public.employeurs_suivis to authenticated;
revoke all on public.employeurs_suivis from anon;
create trigger employeurs_suivis_set_updated_at before update on public.employeurs_suivis
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
--  Le compteur de priorite se tient tout seul : un compteur maintenu par le
--  code applicatif derive au premier chemin qu on oublie.
-- --------------------------------------------------------------------------
create or replace function worker.maj_suivi_par()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into worker.employeurs (nom_canonique, nom_affiche)
    values (new.nom_canonique, new.nom_canonique)
    on conflict (nom_canonique) do nothing;
    update worker.employeurs set suivi_par = suivi_par + 1 where nom_canonique = new.nom_canonique;
  elsif tg_op = 'DELETE' then
    update worker.employeurs set suivi_par = greatest(0, suivi_par - 1) where nom_canonique = old.nom_canonique;
  end if;
  return null;
end;
$$;

create trigger suivis_maj_compteur
  after insert or delete on public.employeurs_suivis
  for each row execute function worker.maj_suivi_par();
