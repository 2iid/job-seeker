-- =============================================================================
--  JOB-048 — la file d'approbation.
--
--  REQ-010 : « un élément non traité avant l'expiration de l'offre est archivé
--  avec son motif, JAMAIS ENVOYÉ EN SILENCE APRÈS COUP ».
--
--  Cette clause est la plus facile à manquer et la plus coûteuse à manquer.
--  Le mode d'échec est une file qui « rattrape son retard » : quelqu'un
--  s'absente une semaine, revient, et l'agent envoie d'un coup douze
--  candidatures — dont sept à des offres fermées, et cinq qui ne
--  l'intéressent plus. Aucune de ces douze n'a été décidée le jour où elle
--  part.
--
--  D'où `expire_le` sur l'élément de file, et un archivage qui écrit un motif
--  au lieu de laisser la ligne prête à partir.
-- =============================================================================

create type public.motif_refus as enum (
  'salaire-insuffisant',
  'lieu',
  'employeur',
  'intitule-trompeur',
  'deja-postule',
  'plus-interesse',
  'document-inexact',
  'autre'
);

alter table public.opportunites
  -- Quand cet élément cesse d'être décidable. Nul = pas de date connue, et
  -- l'élément reste en file : inventer une échéance serait pire que ne pas en
  -- avoir, puisqu'elle archiverait une offre encore ouverte.
  add column approbation_expire_le timestamptz,
  add column motif_refus public.motif_refus,
  add column motif_refus_note text,
  add column archivee_le timestamptz,
  add column archivage_raison text;

comment on column public.opportunites.approbation_expire_le is
  'Quand l élément cesse d être décidable. Nul = pas d échéance connue : inventer une date archiverait une offre encore ouverte.';
comment on column public.opportunites.archivage_raison is
  'Pourquoi l élément a quitté la file sans décision. Une ligne qui disparaît sans raison est une décision prise à la place de quelqu un.';

-- Un refus PORTE son motif. Sans contrainte, la moitié des refus arriveraient
-- sans motif et REQ-006 — l'apprentissage à partir des refus — n'aurait rien à
-- lire.
alter table public.opportunites add constraint refus_porte_son_motif check (
  statut <> 'ecartee' or motif_refus is not null or archivee_le is not null
);

create index opportunites_file_idx
  on public.opportunites (profile_id, statut, approbation_expire_le)
  where archivee_le is null;
