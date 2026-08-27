-- =============================================================================
--  JOB-049 / REQ-011 — « Une soumission réussie enregistre la confirmation
--  obtenue (page, référence, email d'accusé). »
--
--  Le reçu de REQ-013 (JOB-055) portera la preuve complète de ce qui est parti.
--  Mais il n'existe pas encore, et une confirmation obtenue puis jetée ne se
--  retrouve pas : le destinataire ne la redonnera pas. On l'écrit donc ici, au
--  moment où on l'a.
-- =============================================================================

alter table public.dossiers
  add column confirmation_reference text,
  add column confirmation_recue_le timestamptz,
  -- Le destinataire EXACT, tel que vérifié. Pas pour l'afficher partout, mais
  -- parce que « à qui ai-je écrit ? » est la première question de quelqu'un qui
  -- découvre qu'un message est parti en son nom.
  add column destination_adresse text,
  add column destination_provenance text
    check (destination_provenance in ('contact-enregistre', 'domaine-employeur'));

comment on column public.dossiers.confirmation_reference is
  'Ce que le destinataire a repondu. Obtenue une fois, jamais redonnee : la jeter serait definitif.';

-- Une confirmation sans envoi n'a pas de sens, et un envoi sans confirmation
-- non plus. La contrainte évite qu'une écriture partielle passe pour l'une ou
-- l'autre — c'est la ligne qu'on lira le jour d'un litige.
alter table public.dossiers add constraint dossiers_confirmation_coherente
  check (
    (issue <> 'envoye')
    or (confirmation_reference is not null and destination_adresse is not null)
  );

-- Le support voit QU'IL y a eu confirmation et quand, jamais à qui : une
-- adresse de recruteur est une donnée de la personne, pas du produit.
grant select (confirmation_reference, confirmation_recue_le, destination_provenance)
  on public.dossiers to support;
