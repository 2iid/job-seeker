-- =============================================================================
--  JOB-055 / REQ-013 — « Une action sans reçu est un INCIDENT : le produit
--  alerte plutôt que de laisser un trou. »
--
--  ── Comment un trou peut-il exister, si le reçu s'écrit dans la même
--     transaction que le reste ? ──
--
--  Parce que l'ENVOI, lui, n'est pas dans la transaction. La séquence est :
--  réclamer (transaction), envoyer (réseau), écrire (transaction). Un processus
--  qui meurt entre le deuxième et le troisième temps a produit une action
--  sortante dont il ne reste aucune trace — et c'est exactement l'état
--  « en-cours au bail expiré » que JOB-051 refuse de rejouer.
--
--  Refuser de rejouer était la moitié du travail. L'autre moitié est de le
--  DIRE : un doute silencieux est un trou, quelle que soit la prudence avec
--  laquelle on l'a créé.
--
--  ── À qui le produit alerte-t-il ──
--
--  À la personne d'abord. C'est SA candidature qui est peut-être partie sans
--  preuve, et elle est la seule à pouvoir aller vérifier dans sa boîte ou chez
--  le recruteur. Un incident qui ne remonterait qu'à un tableau d'exploitation
--  la laisserait ignorer qu'elle a peut-être postulé.
-- =============================================================================

create type public.genre_incident as enum (
  -- Une action a pu partir sans qu'on puisse le prouver.
  'action-sans-preuve',
  -- Un envoi enregistré sans reçu : l'invariant de transaction a été violé.
  'envoi-sans-recu',
  -- Un reçu sans envoi correspondant : l'inverse, tout aussi anormal.
  'recu-orphelin'
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  opportunite_id uuid references public.opportunites (id) on delete set null,
  genre public.genre_incident not null,
  -- Ce que le produit a constaté, en clair, destiné à être LU par la personne.
  constat text not null,
  -- Ce qu'elle peut faire. Un incident sans conduite à tenir est une angoisse
  -- sans issue : le produit sait ce qu'il ne sait pas, il doit dire quoi faire.
  conduite text not null,
  detecte_le timestamptz not null default now(),
  -- Un incident se CLÔT, il ne s'efface pas : « c'était une fausse alerte » est
  -- une information, pas une raison de faire disparaître la ligne.
  clos_le timestamptz,
  clos_par text,
  clos_motif text,
  -- Un seul incident ouvert par opportunité et par genre : la réconciliation
  -- tourne en boucle, elle ne doit pas empiler la même alerte à chaque tour.
  unique (opportunite_id, genre)
);

comment on table public.incidents is
  'REQ-013 : « une action sans recu est un incident ». L alerte va d abord a la personne — c est SA candidature qui est peut-etre partie sans preuve.';

create index incidents_ouverts_idx on public.incidents (profile_id, detecte_le desc)
  where clos_le is null;

alter table public.incidents enable row level security;
alter table public.incidents force row level security;

create policy incidents_select_mien on public.incidents for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- Lecture seule côté client : un incident est constaté par le produit. Le
-- clore est une action du produit ou du support, jamais une case qu'on décoche
-- pour faire disparaître le message.
grant select on public.incidents to authenticated;

-- Le support voit tout d'un incident : il n'y a ici aucun contenu de document,
-- seulement un constat et une conduite à tenir. C'est même précisément ce qu'il
-- doit pouvoir lire pour aider.
grant select on public.incidents to support;
create policy incidents_select_support on public.incidents for select to support using (true);
