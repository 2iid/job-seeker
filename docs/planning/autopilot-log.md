# Autopilot decision log — job-seeker

> Chaque décision prise à la place de l'humain est une ligne. C'est le prix du feu vert : une exécution
> qui prend quarante décisions sans en consigner aucune ne peut pas être relue, seulement refaite.
>
> **Règle** = quelle clause de l'étape 3 du playbook a été utilisée :
> `RECOMMENDED` · `ASSUMED` (options sans recommandation → la plus réversible) · `BRIEF` (la réponse
> était déjà dans le brief ou la spec, citée) · `STOPPED` (rien ne s'appliquait, on s'arrête).

**Demandé :** 2026-08-25 par 2iD · **Portée :** le backlog entier

---

## Exécution 1 — 2026-08-25 · ARRÊTÉE AU PRÉFLIGHT

`/autopilot` **n'a pas démarré**. Deux des cinq contrôles de l'étape 1 échouent, pour une seule cause :
`vantry.yml` n'existait pas, donc `scripts/verify.sh` déclarait la vérification **UNDEFINED**. Le playbook
est explicite — *« an autonomous run against an undefined verification is theatre »*.

| contrôle | résultat |
|---|---|
| `validate-config.sh` + `run.smoke` non vide | ✗ `vantry.yml` absent |
| `lint-kanban.sh` | ✓ exit 0 |
| `verify.sh` vert sur le tronc | ✗ UNDEFINED |
| agents et `paths` déclarés | ✓ · 14 fichiers de critères pour 82 issues |
| budget Actions | ✓ dépôt **public** → runners standard gratuits et illimités |

Le blocage n'était pas une panne mais le jour zéro : les deux contrôles en échec **sont** `JOB-001` et
`JOB-007`. Ils ont donc été construits comme travail ordinaire, à travers la porte, pour qu'un prochain
`/autopilot` passe le préflight.

## Décisions prises pendant le déblocage

| # | issue | la question | choisi | écarté | règle | pourquoi |
|---|---|---|---|---|---|---|
| 1 | JOB-001·003·007 | Trois issues, une PR ou trois ? | **Une PR** | Trois PR séparées | ASSUMED | Mutuellement dépendantes au jour zéro : pas de contrat sans application, pas d'application vérifiable sans contrat. Une PR dont la vérification passe est plus réversible que trois qui ne peuvent pas passer isolément. |
| 2 | JOB-007 | `strictness` : `relaxed` ou `standard` ? | **`standard`** | `relaxed` | ASSUMED | Le kit conseille `relaxed` pour un dépôt qui ne peut pas passer la porte. Le nôtre la passe réellement — `✓ VERIFIED` avant même le premier commit. Relâcher une porte que le code satisfait déjà, c'est l'affaiblir sans contrepartie. Réversible en une ligne. |
| 3 | JOB-001 | Gestionnaire de paquets | **pnpm workspaces** | npm workspaces | BRIEF | ADR-0001 : *« Next.js 15 + Supabase … plus un service worker conteneurisé distinct »* et l'exemple de contrat du kit emploie `pnpm`. Disponible sur la machine (11.9.0). |
| 4 | JOB-001 | Scripts d'installation des dépendances | **Liste nominative** (`esbuild`, `sharp`) | Blanc-seing global | ASSUMED | pnpm 11 refuse les scripts d'installation par défaut. Autoriser nommément deux paquets est le choix le plus réversible et le plus auditable ; `dangerouslyAllowAllBuilds` aurait ouvert la chaîne d'approvisionnement entière. |
| 5 | JOB-003 | Comment garantir que `process.env` n'est lu qu'à un endroit ? | **Règle ESLint** `no-restricted-properties` | Une phrase dans la doc | BRIEF | La spec exige des contrôles vérifiés, pas décrits — REQ-007 pose déjà le principe : *« contrainte vérifiée par un test automatisé sur la sortie, pas par une consigne »*. |
| 6 | JOB-007 | Que doit exercer `run.smoke` ? | **Build + start + lecture du HTML réel + en-têtes servis** | `pnpm test` | BRIEF | `vantry.yml` du kit : avec `run.smoke` vide, la vérification est UNDEFINED et *« it will not fall back to your test suite, because a passing test suite is precisely what the failure looked like the first time »*. |
| 7 | — | Le scan de secrets refuse les fixtures de test | **Marqueur `EXAMPLE` prévu par la règle** | `git commit --no-verify` | RECOMMENDED | Le playbook interdit de contourner une porte pour avancer. La règle de `.githooks/pre-commit` filtre elle-même les lignes contenant `EXAMPLE` — l'échappement prévu a été utilisé, pas contourné. Deux commits refusés avant correction. |

## Conditions d'arrêt rencontrées

| # | ce qui a arrêté | pourquoi c'est un arrêt |
|---|---|---|
| A | **Préflight** (étape 1) | `verify.sh` UNDEFINED sur le tronc. Levé par cette PR. |
| C | **CI indisponible — compte GitHub verrouillé** | Étape 4, *« CI unavailable »*. La CI de la PR #2 rapporte, sur chaque job : `The job was not started because your account is locked due to a billing issue.` Ce n'est **pas** le quota de minutes : un compte verrouillé bloque Actions **même sur un dépôt public**, ce qui invalide l'hypothèse ayant motivé le passage en public. Seul 2iD peut lever cela (GitHub → Settings → Billing). Tant que la CI ne tourne pas, aucune PR ne peut être fusionnée sur preuve, et l'exécution autonome n'a pas de garde-fou distant. |
| B | **`JOB-002` — pointe technique ATS** | Étape 4, *« anything irreversible »*. L'issue demande **vingt soumissions réelles sur des formulaires d'employeurs réels** : des candidatures qui arrivent chez de vraies personnes, au nom d'un vrai candidat. `SECURITY.md` l'interdit explicitement (*« Never submit a real job application as part of a test »*). Aucun agent autonome ne peut l'exécuter. Elle demande un humain, ou un bac à sable avec des formulaires de test fournis par les ATS. |

## Exécution 2 — 2026-08-25 · travail hors CI

2iD règle la facturation la semaine prochaine et refuse que cela bloque. Constat qui change tout :
**le push fonctionne, seul le démarrage des jobs Actions est bloqué.** Et le kit dit lui-même que la CI
est un accélérateur, pas la garantie. Ce qu'elle apporte que les hooks n'apportent pas, c'est **une
exécution indépendante qui ne fait pas confiance au reçu local** — et cela est reproductible hors GitHub.

| # | issue | la question | choisi | écarté | règle | pourquoi |
|---|---|---|---|---|---|---|
| 8 | — | Garder une contre-vérification indépendante sans Actions ? | **`scripts/ci-local.sh`** — clone propre, install, `verify.sh --ci`, revue sensible, scan de vulnérabilités | `act` + Docker ; ou s'en passer | ASSUMED | `act` est absent, et une image Docker n'aurait rien ajouté : le job CI est un checkout neuf plus `verify.sh --ci`. Un clone propre reproduit la propriété qui compte — aucun reçu local n'y existe. Réversible : le script disparaît quand la CI repart. |
| 9 | — | 5 vulnérabilités transitives, 3 hautes, épinglées par Next | **`overrides` explicites** citant chaque avis | Attendre Next ; passer en Next 16 bêta | ASSUMED | `next@15.5.23` est déjà la dernière 15.x, la 16 n'est qu'en bêta. Un override borné et commenté est plus réversible qu'un saut de majeure en pré-version. Vérifié : `sharp 0.35` ne casse ni build ni smoke. |
| 10 | — | `scan-vulns.sh` et `osv-scan.py` échouaient sur pnpm | **Corriger les deux à la source** | Contourner dans `ci-local.sh` | ASSUMED | Contourner aurait laissé la CI GitHub échouer au retour de la facturation, et surtout laissé OSV scanner **zéro paquet** en annonçant « aucun lockfile » — un scan propre pour un scan qui n'a pas eu lieu. Corrigé : 256 paquets réellement vérifiés. |
| 11 | PR #2 | Fusionner sans CI GitHub ? | **Proposé à 2iD, non exécuté** | Fusionner moi-même ; empiler les branches | STOPPED | La fusion est une action sortante : elle a été refusée par une garde de l'environnement, et `merge.authority: human` la lui attribue de toute façon. Les quatre jobs passent sur un clone propre, la revue est commitée : la décision est documentée, la main revient à 2iD. |

**Constats de la revue de sécurité de la PR #2** — verdict `pass`, trois constats, aucun tu :
F1 (medium, **corrigé**) `sensitive_paths` omettait `packages/parsing/**` et `apps/worker/src/matching/**` ·
F2 (low, **reporté à JOB-006**) `SUPABASE_ANON_KEY` devra devenir `NEXT_PUBLIC_*` quand le client navigateur arrive, et la clé de service ne doit jamais suivre ·
F3 (low, **reporté à JOB-073**) `/api/health` est publique sans limitation de débit — acceptable pour une sonde qui ne divulgue rien.

## État à la fin de cette exécution

- **Fusionné :** rien — `main` exige une PR, deux sont ouvertes et attendent 2iD.
- **En attente :** PR #1 (docs `JOB-008`) et la PR de fondation (`JOB-001`, `JOB-003`, `JOB-007`).
- **Minutes Actions dépensées :** 0 — aucun job n'a démarré, le compte est verrouillé pour facturation.
- **Reste au tableau :** 79 issues, dont `JOB-002` qui ne peut pas être automatisée.
- **Préflight rejoué après la fondation :** `validate-config` exit 0 · `lint-kanban` exit 0 ·
  `verify.sh --gate` exit 0. Les trois contrôles locaux passent désormais ; seule la CI bloque.
- `merge.authority` n'a **jamais** été passé à `agent` : l'exécution s'est arrêtée au préflight, donc
  l'étape 0 n'a pas eu lieu et aucune autonomie n'a été accordée. `.vantry/autopilot.json` n'existe pas.
