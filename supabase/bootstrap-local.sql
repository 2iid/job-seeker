-- =============================================================================
--  Ce que la pile LOCALE n'a pas et que la pile hébergée a.
--
--  Sur un projet Supabase hébergé, le rôle `postgres` est membre de
--  `supabase_storage_admin` : c'est ce qui permet à une migration ordinaire de
--  poser des politiques sur `storage.objects`, et c'est le motif documenté par
--  Supabase. La pile locale du CLI ne pose pas ce lien, et une migration qui
--  marche en production échoue ici sur « must be owner of table objects » —
--  un message qui envoie chercher un bug dans le SQL alors que le SQL est bon.
--
--  Ce fichier n'ajoute donc AUCUN privilège que la production n'aurait pas :
--  il aligne le local sur l'hébergé. Il est joué par `scripts/db-bootstrap.sh`
--  avec le superutilisateur LOCAL, qui n'existe que dans le conteneur de
--  développement.
-- =============================================================================

grant supabase_storage_admin to postgres;

-- Une politique de stockage qui compare à `auth.uid()` doit pouvoir être
-- ANALYSÉE au moment où on la crée, donc par le rôle qui la crée. À
-- l'exécution, elle est évaluée sous le rôle qui interroge — `authenticated`,
-- qui a déjà ce qu'il faut. Ces deux lignes ne servent donc qu'à la création,
-- et n'élargissent rien de ce qui est joignable à l'exécution.
grant usage on schema auth to supabase_storage_admin;
grant execute on function auth.uid() to supabase_storage_admin;
