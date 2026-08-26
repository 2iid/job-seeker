-- =============================================================================
--  JOB-081 — le cran d'autonomie, et la fin du parcours d'entrée.
--
--  Deux colonnes, et la seconde est celle qui compte.
--
--  `cran_autonomie` porte les quatre crans de REQ-009. Le défaut est
--  « proposer », JAMAIS « agir-seul » : la confiance se donne progressivement,
--  et un défaut permissif la prendrait sans qu'on la donne.
--
--  `parcours_termine_le` est la garde du parcours d'entrée. Tant qu'elle est
--  nulle, AUCUNE action sortante ne part — quel que soit le cran affiché.
--
--  Cette seconde colonne existe pour une raison précise. Le parcours d'entrée
--  montre le cadran d'autonomie et laisse la personne le déplacer : c'est le
--  moment où elle comprend ce qu'elle accorde. Mais elle le déplace pour
--  APPRENDRE, pas pour autoriser — et pendant qu'elle explore, l'agent est
--  déjà en train de trouver des offres en direct sous ses yeux. Sans cette
--  garde, déplacer le cadran par curiosité enverrait une vraie candidature.
--
--  Elle ne peut donc pas être déduite d'un état d'écran : un composant qui
--  décide « le parcours est fini » vit dans le navigateur, et le worker n'y a
--  pas accès. La garde est en base, là où le worker la lit.
-- =============================================================================

create type public.cran_autonomie as enum (
  'observer',           -- je regarde, je ne propose rien
  'proposer',           -- je propose, vous décidez
  'agir-apres-accord',  -- j'agis, après votre accord explicite
  'agir-seul'           -- j'agis seule, sur mandat horodaté (REQ-009)
);

alter table public.profiles
  add column cran_autonomie public.cran_autonomie not null default 'proposer',
  add column parcours_termine_le timestamptz;

comment on column public.profiles.cran_autonomie is
  'Défaut « proposer », jamais « agir-seul » : la confiance se donne progressivement, et un défaut permissif la prendrait sans qu on la donne.';

comment on column public.profiles.parcours_termine_le is
  'Tant que nul, AUCUNE action sortante ne part, quel que soit le cran. Pendant le parcours d entrée la personne déplace le cadran pour APPRENDRE, pas pour autoriser.';
