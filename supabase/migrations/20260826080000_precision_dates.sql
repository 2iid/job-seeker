-- =============================================================================
--  JOB-032 — la précision d'une date de CV.
--
--  Un CV écrit « 2021 ». La colonne veut une `date`. La conversion naïve donne
--  le 1er janvier 2021, et à partir de là plus personne — ni l'écran, ni la
--  personne, ni une relecture six mois plus tard — ne peut distinguer la date
--  qu'elle a donnée de celle qu'on a inventée pour elle. C'est exactement le
--  genre de faux détail que REQ-001 existe pour empêcher : ce produit relit à
--  voix haute ce qu'une machine a compris, il ne peut pas ajouter en silence
--  une information qui n'était pas dans le document.
--
--  Le 1er janvier reste le point d'ancrage — il faut bien trier — mais il est
--  désormais MARQUÉ comme une approximation. C'est la précision qui rend la
--  conversion réversible, et donc honnête.
-- =============================================================================

create type public.precision_date as enum ('jour', 'mois', 'annee');

alter table public.experiences
  add column debut_precision public.precision_date not null default 'annee',
  add column fin_precision public.precision_date;

comment on column public.experiences.debut_precision is
  'Ce que le CV disait réellement. « annee » signifie que le 1er janvier est un ancrage de tri, pas une date écrite par la personne — l affichage doit rendre « 2021 ».';

-- `formations.obtenue_en` est déjà un entier : une année y est une année, sans
-- jour inventé. Rien à corriger de ce côté.
