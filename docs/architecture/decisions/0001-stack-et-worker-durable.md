# ADR-0001 — Stack : Next.js + Supabase, avec un worker durable conteneurisé

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** 2iD
- **Supersedes:** —
- **Related:** ADR-0002 (architecture du moteur de veille)

## Context

Le produit doit exécuter en continu une boucle que le web ne déclenche pas : interroger des
centaines de sources d'offres toutes les quelques minutes, faire tourner des files d'attente,
appeler des LLM sur des tâches longues, et piloter un navigateur pour soumettre des candidatures
sur les formulaires publics des ATS. Rien de cela ne tient dans une fonction serverless : les
budgets d'exécution sont trop courts, l'état ne survit pas, et Playwright ne s'y installe pas.

En face, la partie applicative est classique : authentification, base relationnelle, temps réel,
stockage de fichiers, abonnement payant.

Contraintes dures : données personnelles sensibles (CV, salaires, recherche d'emploi menée en
poste) donc cloisonnement par utilisateur prouvé **au niveau de la base** (OBL-1) ; utilisateurs et
offres **dans le monde entier**, avec des utilisateurs européens qui imposent le RGPD ; équipe
composée d'agents Claude Code pilotés par une personne, donc la densité de documentation et la
maturité de l'écosystème comptent plus que l'élégance ; budget de démarrage réduit.

## Decision

Nous construirons l'application web en **Next.js 15 (App Router, TypeScript)** sur **Supabase**
(Postgres avec RLS, Auth, Storage, Realtime), avec **Stripe** pour l'abonnement et l'**API Claude**
pour la génération, et nous exécuterons toute la boucle autonome dans un **service worker
conteneurisé distinct**, écrit en TypeScript, déployé en région européenne sur Fly.io ou Railway,
qui possède ses files d'attente, ses tâches planifiées et son navigateur piloté.

La frontière est explicite : **le front n'écrit jamais d'action sortante, le worker n'a jamais de
session utilisateur.** Ils communiquent par la base et par une file, jamais par appel direct.

## Rationale

| Exigence | Comment cette décision la satisfait |
|---|---|
| Cloisonnement prouvé au niveau des données (OBL-1, REQ-014) | La RLS Postgres de Supabase permet des tests d'autorisation **et de refus** exécutés contre la vraie base, ce que le playbook `rls-policy` exige |
| Polling toutes les 2–5 min, files, reprise après incident (REQ-003) | Un conteneur qui tourne en permanence porte un planificateur et une file durable ; c'est le seul des trois candidats où c'est le cas nominal et non un contournement |
| Navigateur piloté pour la soumission (REQ-011) | Playwright s'installe et se maintient dans un conteneur ; c'est le point qui a éliminé les deux alternatives |
| Arrêt d'urgence effectif en moins de 5 s (REQ-012) | Le worker possède sa file : il peut la purger et interrompre au point de contrôle. Un système d'invocations sans état ne peut pas rappeler ce qu'il a déjà lancé |
| Reçus immuables (REQ-013) | Postgres avec des privilèges d'écriture séparés et une table en insertion seule ; le worker écrit, personne ne met à jour |
| Une personne pilotant des agents | Next.js + Supabase est l'écosystème le mieux documenté du marché, donc celui où les agents produisent le moins d'erreurs — et c'est le profil par défaut de Vantry, donc les 48 playbooks s'appliquent sans traduction |
| Coût de démarrage | Paliers gratuits ou quasi gratuits sur les trois briques tant que le volume est faible |

## Consequences

**Positives**
- Deux surfaces de déploiement seulement, chacune avec un rôle net ; la revue de sécurité sait où
  regarder pour l'envoi sortant.
- La RLS répond en une fois à l'isolation multi-utilisateur, à l'accès du support et aux tests de refus.
- Le worker est remplaçable sans toucher au produit : si l'hypothèse n°1 du brief s'effondre, on
  change ce qu'il y a dedans, pas l'architecture.

**Négatives — chacune avec sa mitigation**
- **Deux dépôts de déploiement à maintenir, deux jeux de secrets, deux chaînes CI.** → *Mitigation :*
  un seul dépôt (monorepo) avec des types partagés, et la CI ne déploie le worker que si son dossier
  a changé.
- **Le worker est un composant à état : il peut dériver, se bloquer, ou rejouer.** → *Mitigation :*
  idempotence obligatoire sur chaque travail (REQ-011), sonde de santé, et alerte quand une file
  cesse d'avancer — le playbook `background-job` s'applique.
- **Supabase est un fournisseur unique pour la base, l'auth et le stockage.** → *Mitigation :* c'est
  du Postgres standard ; l'accès passe par une couche de dépôt, et un export de schéma est produit à
  chaque migration pour que la sortie reste possible.
- **Des utilisateurs hors UE avec des données hébergées en UE**, ce qui n'est pas optimal en latence
  ni en résidence des données. → *Mitigation :* acceptable au MVP — la latence porte sur des tâches
  de fond, pas sur l'interface ; une région supplémentaire sera un choix commercial, pas technique.
- **Playwright est fragile et coûteux en ressources.** → *Mitigation :* c'est précisément ce que la
  pointe technique du sprint 1 doit mesurer ; le budget mémoire du worker est dimensionné après.

## Alternatives considered

- **Tout sur Cloudflare (Workers, Queues, Durable Objects, D1/R2, Browser Rendering)** — rejeté parce
  que le cloisonnement par utilisateur devrait être réimplémenté à la main sans RLS Postgres, alors
  que c'est notre obligation la plus lourde, et parce que le navigateur piloté y est un service
  contraint et facturé à l'usage plutôt qu'un processus que l'on maîtrise — exactement le composant
  dont on ignore encore le comportement réel.
- **Un VPS unique portant tout** — rejeté parce que l'isolation, les sauvegardes et la montée en
  charge deviennent du travail manuel dès le premier utilisateur payant, pour une économie qui ne se
  matérialise qu'à un volume que nous n'avons pas.
- **Next.js seul avec des tâches planifiées serverless** — rejeté parce que la granularité de
  planification et les limites de durée rendent impossibles à la fois le polling à 2–5 minutes et la
  soumission par navigateur, c'est-à-dire les deux choses qui font le produit.
- **Ne rien décider** — impossible : `vantry.yml` ne peut pas déclarer comment ce projet se vérifie
  tant que la stack n'est pas fixée, donc la porte de vérification reste inerte et aucune issue ne
  peut être clôturée proprement.
