-- =============================================================================
--  JOB-065 / REQ-016 / OBL-3 — les contacts recruteurs.
--
--  ── La décision d'architecture, et c'est la plus importante du fichier ──
--
--  Un contact est rattaché à UNE opportunité, pas à un employeur. La table qui
--  serait utile — un annuaire de recruteurs, réutilisable d'une candidature à
--  l'autre — est exactement ce qu'OBL-3 interdit : « finalité limitée à la mise
--  en relation ».
--
--  Ces personnes ne sont pas nos utilisateurs. Elles n'ont rien accepté. Le
--  produit ne construit donc pas de fichier sur elles : il retient qui écrire
--  pour CETTE candidature, et cela disparaît avec elle.
--
--  Le coût est réel — on ré-identifie le même recruteur à la candidature
--  suivante — et c'est le prix de la limitation de finalité. Le noter ici pour
--  que personne ne « corrige » cette inefficacité sans savoir ce qu'il défait.
-- =============================================================================

create type public.certitude_contact as enum (
  -- Publiée par l'employeur pour recevoir des candidatures.
  'confirme',
  -- Trouvée sur un domaine de l'employeur, sans être une adresse de candidature.
  'probable',
  -- DÉDUITE d'un motif de nommage. Jamais un fait.
  'devine'
);

create type public.source_contact as enum (
  'page-carrieres',
  'registre-public',
  'fourni-par-vous',
  'motif-de-domaine'
);
-- Il n'existe PAS de valeur « texte-de-l-offre », et ce n'est pas un oubli.
-- L'énumération est fermée pour qu'ajouter une source soit un changement
-- visible et discuté — pas un paramètre de plus. Voir F26.
comment on type public.source_contact is
  'Aucune valeur ne designe le contenu recupere d une annonce : une adresse tiree du texte d une offre publiee par un inconnu ferait expedier un CV a l adresse de son choix.';

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Rattaché à l'opportunité : le contact meurt avec la candidature.
  opportunite_id uuid not null,
  nom text,
  poste text,
  adresse text not null,
  certitude public.certitude_contact not null,
  source public.source_contact not null,
  -- Ce sur quoi la certitude repose, en clair, destiné à être MONTRÉ.
  -- « Une adresse devinée est présentée comme devinée, jamais comme un fait. »
  justification text not null,
  -- Conservation bornée (OBL-3). Au-delà, la ligne est purgée même si la
  -- candidature vit encore : une adresse de recruteur n'a pas à survivre à
  -- l'échange qu'elle a servi.
  expire_le timestamptz not null default now() + interval '180 days',
  created_at timestamptz not null default now(),
  -- Une même adresse une seule fois par opportunité.
  unique (opportunite_id, adresse),
  -- F27 : le dossier et l'opportunité appartiennent à la même personne, et le
  -- désaccord n'est pas exprimable.
  constraint contacts_appartiennent_a_leur_opportunite
    foreign key (opportunite_id, profile_id)
    references public.opportunites (id, profile_id) on delete cascade,
  -- Une adresse DEVINÉE ne peut pas venir d'ailleurs que d'un motif, et un
  -- motif ne peut rien produire d'autre qu'une devinette. Les deux colonnes se
  -- tiennent l'une l'autre plutôt que de se contredire un jour en silence.
  constraint devinee_vient_d_un_motif check (
    (certitude = 'devine') = (source = 'motif-de-domaine')
  )
);

comment on table public.contacts is
  'OBL-3 : rattache a UNE opportunite, jamais un annuaire de recruteurs. Ces personnes ne sont pas nos utilisateurs et n ont rien accepte.';

create index contacts_opportunite_idx on public.contacts (opportunite_id);
create index contacts_expiration_idx on public.contacts (expire_le);

alter table public.contacts enable row level security;
alter table public.contacts force row level security;

create policy contacts_select_mien on public.contacts for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- La personne peut RETIRER un contact qu'elle ne veut pas utiliser. Elle ne
-- peut pas en ajouter ni en modifier : une adresse que le produit n'a pas
-- établie n'a pas de certitude, et la colonne mentirait.
create policy contacts_delete_mien on public.contacts for delete to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

grant select, delete on public.contacts to authenticated;

-- REQ-014 : le support voit qu'un contact existe et avec quelle certitude,
-- jamais l'adresse ni le nom de la personne. C'est une donnée de tiers ; le
-- support n'a aucune raison légitime de la lire.
grant select (id, profile_id, opportunite_id, certitude, source, expire_le, created_at)
  on public.contacts to support;
create policy contacts_select_support on public.contacts for select to support using (true);

-- --------------------------------------------------------------------------
--  OBL-3 — le droit d'opposition.
--
--  GLOBALE, contrairement aux contacts. Une personne qui demande à ne plus être
--  contactée ne le demande pas « pour ce candidat-là » : la scoper par profil
--  reviendrait à lui faire répéter son refus à chaque nouvel utilisateur du
--  produit, ce qui n'est pas un droit d'opposition mais une corvée.
--
--  Stockée en EMPREINTE. Une table d'adresses de recruteurs qui se sont opposés
--  serait, elle aussi, un annuaire de recruteurs — construit à partir de gens
--  ayant explicitement demandé qu'on les laisse tranquilles.
-- --------------------------------------------------------------------------
create table public.oppositions_contact (
  empreinte text primary key,
  oppose_le timestamptz not null default now(),
  -- D'où vient l'opposition, sans nommer personne.
  origine text not null check (origine in ('demande-directe', 'retour-automatique', 'signalement'))
);

comment on table public.oppositions_contact is
  'OBL-3. Empreinte et non adresse : une liste d adresses de gens ayant demande qu on les laisse tranquilles serait encore un annuaire.';

alter table public.oppositions_contact enable row level security;
alter table public.oppositions_contact force row level security;
revoke all on public.oppositions_contact from anon, authenticated;
