-- =============================================================================
--  JOB-065 — `oppositions_contact` : le privilège, pas la RLS.
--
--  Même diagnostic qu'en JOB-073 pour `limitation_debit`, et il vaut la peine
--  d'être posé deux fois plutôt que copié : la RLS répond à « QUELLES LIGNES
--  cette personne peut-elle voir ? ». Ici la réponse n'est pas « les siennes »
--  — c'est « aucune, pour personne ». Ce n'est pas une question de lignes.
--
--  Et elle serait décorative : la table n'est écrite que par le worker, sous
--  `service_role`, qui contourne la RLS. La politique ne serait jamais évaluée
--  sur le seul chemin qui écrit.
--
--  La garantie réelle est l'absence de privilège, et l'invariant du socle la
--  vérifie déjà dans les deux sens : aucune table atteignable par un client
--  sans RLS, aucune table sans RLS atteignable par un client.
-- =============================================================================
alter table public.oppositions_contact no force row level security;
alter table public.oppositions_contact disable row level security;
