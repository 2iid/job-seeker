-- =============================================================================
--  JOB-041 — les refus de modification, définitifs POUR CETTE CANDIDATURE.
--
--  REQ-007 : « chaque modification peut être acceptée ou refusée
--  individuellement ; un refus est définitif pour cette candidature ».
--
--  La raison n'est pas technique. Quelqu'un qui refuse une reformulation vient
--  de dire « ça, je ne le tiendrai pas en entretien ». La lui reproposer au
--  prochain écran, ou la laisser revenir parce qu'on a régénéré le document,
--  transformerait son refus en un obstacle qu'on lui fait franchir plusieurs
--  fois — et à la troisième, il acceptera pour en finir.
--
--  Le stockage est une liste d'identifiants sur la CANDIDATURE, et pas sur le
--  profil : « définitif pour cette candidature » est plus étroit que « pour
--  toujours ». La même reformulation peut être juste pour une autre offre, et
--  décider à la place de quelqu'un qu'il ne la voudra jamais serait aller
--  au-delà de ce qu'il a dit.
-- =============================================================================

alter table public.opportunites
  add column modifications_refusees jsonb not null default '[]'::jsonb,
  -- Le document tel qu'il sera envoyé, une fois les refus appliqués. Il est
  -- figé au moment de l'approbation : un document recalculé à l'envoi ne
  -- serait plus celui que la personne a relu.
  add column document_fige jsonb;

comment on column public.opportunites.modifications_refusees is
  'Identifiants des modifications refusées, définitifs pour CETTE candidature. Plus étroit que « pour toujours » : la même reformulation peut être juste ailleurs.';
comment on column public.opportunites.document_fige is
  'Figé à l approbation. Un document recalculé à l envoi ne serait plus celui que la personne a relu.';
