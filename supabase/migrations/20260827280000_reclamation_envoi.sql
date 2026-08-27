-- =============================================================================
--  JOB-051 / REQ-011 — « Une soumission n'est jamais rejouée à l'identique :
--  un doublon sur la même offre est détecté et refusé, MÊME APRÈS UN INCIDENT
--  OU UN REDÉMARRAGE DU WORKER. »
--
--  ── Pourquoi la clé d'idempotence de la file ne suffit pas ──
--
--  `worker.jobs.idempotency_key` garantit qu'un même TRAVAIL n'est pas mis en
--  file deux fois. Ce n'est pas la même chose. `claim_job` reprend un travail
--  dont le bail a expiré — c'est même sa raison d'être. Donc un worker qui
--  meurt APRÈS avoir envoyé et AVANT d'avoir écrit le résultat verra son
--  travail revenir en file, et enverra une seconde fois. La clé de la file
--  protège la mise en file, pas l'effet de bord sortant.
--
--  ── La forme de la garantie : on réclame AVANT d'envoyer ──
--
--  L'ordre est tout. Écrire le résultat après l'envoi laisse une fenêtre où le
--  système ne sait rien ; réclamer avant la déplace vers un endroit où elle est
--  RÉCUPÉRABLE : au redémarrage, une réclamation sans issue est visible, et
--  elle dit « je ne sais pas si c'est parti ».
--
--  Une fenêtre d'ignorance ne se supprime pas. Elle se déplace là où quelqu'un
--  peut la voir.
-- =============================================================================

alter table public.dossiers drop constraint if exists dossiers_issue_check;
alter table public.dossiers add constraint dossiers_issue_check
  check (issue in ('en-cours', 'prepare', 'envoye', 'refuse', 'incertain'));

-- Quand la réclamation a été prise, et jusqu'à quand son détenteur la tient.
alter table public.dossiers
  add column reclame_le timestamptz,
  add column reclame_par text,
  add column bail_jusqu_a timestamptz;

comment on column public.dossiers.bail_jusqu_a is
  'Un bail EXPIRE ne rend jamais la reclamation : il la rend INCERTAINE. Presumer l echec est le raisonnement qui envoie deux fois.';

-- Une réclamation en cours doit dire par qui et jusqu'à quand, sinon elle n'est
-- pas exploitable au redémarrage — et c'est précisément le moment où on la lit.
alter table public.dossiers add constraint dossiers_reclamation_complete
  check (
    issue <> 'en-cours'
    or (reclame_le is not null and reclame_par is not null and bail_jusqu_a is not null)
  );

-- Le support voit qu'une réclamation traîne, jamais qui l'a prise n'ayant
-- d'intérêt que technique — mais l'HEURE lui sert à répondre « depuis quand ? ».
grant select (reclame_le, bail_jusqu_a) on public.dossiers to support;

-- Pour retrouver les réclamations abandonnées au redémarrage, sans balayer.
create index dossiers_reclamations_en_cours_idx
  on public.dossiers (bail_jusqu_a) where issue = 'en-cours';
