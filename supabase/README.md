# Base de données

Pile Supabase **locale**, sur sa propre plage de ports pour cohabiter avec les autres projets
de la machine.

| service | URL |
|---|---|
| API (Kong) | `http://127.0.0.1:54521` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54522/postgres` |
| Studio | `http://127.0.0.1:54523` |
| Mailpit | `http://127.0.0.1:54524` |

Les clés locales sont les clés de démonstration publiques de Supabase, identiques sur toute
installation locale. **Elles ne protègent rien et n'ont rien à faire dans un `.env` de production.**

```bash
supabase start          # démarrer la pile
supabase db reset       # rejouer TOUTES les migrations sur une base vierge
pnpm db:export          # régénérer supabase/schema.sql
pnpm vitest run tests/rls
```

## Les deux règles

**1. Une migration livrée ne se modifie jamais.** On en écrit une nouvelle. Éditer une migration
déjà appliquée quelque part produit deux bases qui ne se ressemblent plus, et rien ne le signale.

**2. Toute table portant des données d'utilisateur active la RLS, la force, et n'ouvre l'accès que
par une règle explicite — par opération.** Le défaut est le refus. Une table avec RLS et aucune
politique refuse tout : c'est sûr, mais c'est presque toujours un oubli, et
`tests/rls/profiles.test.ts` le signale.

`force row level security` n'est pas optionnel : sans lui, le propriétaire de la table et toute
fonction `SECURITY DEFINER` contournent les politiques.

Pas de politique `for all` : elle rend lecture et écriture indistinguables, et c'est en écriture
que les erreurs coûtent cher.

## Les tests tournent contre la vraie base

Une politique RLS vérifiée par un simulacre ne prouve rien — c'est Postgres qui l'applique, c'est
donc Postgres qui doit répondre. Chaque politique porte **deux** tests : un qui prouve qu'elle
laisse passer ce qu'elle doit, un qui prouve qu'elle refuse le reste. Un test d'autorisation sans
son test de refus ne prouve rien : une politique `using (true)` le passerait.

Si la base est injoignable, les tests **échouent** — ils ne se sautent pas. Un test sauté en
silence fait passer la suite au vert sans que rien n'ait été vérifié.
