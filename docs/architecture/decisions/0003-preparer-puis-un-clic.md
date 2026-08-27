# ADR-0003 — Préparer en dix secondes, envoyer en un clic

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** 2iD (arbitrage produit) · tech-lead-orchestrator (instruction)
- **Supersedes:** —
- **Related:** ADR-0002 (moteur de veille multi-sources) · `docs/research/spike-ats-submission.md`

## Context

Le brief posait une hypothèse risquée en première position : *l'agent peut-il soumettre une
candidature à la place du candidat ?* Il posait aussi son seuil de viabilité — **70 % de réussite** —
et la bascule à faire en dessous.

`JOB-002` a mesuré. Sur **16 formulaires de candidature réels** répartis sur quatre fournisseurs
(Greenhouse, Ashby, Lever, Workable), **quatorze — 88 % — portent un reCAPTCHA**. Le taux de
formulaires remplissables par une machine est de **6 %**.

Trois faits encadrent cette mesure, et chacun compte :

1. **Elle a été faite sans rien envoyer.** Le harnais va jusqu'au bouton et ne le presse pas ; trois
   tests le vérifient sur son code. Ce qui reste inconnu — le comportement du serveur face à une
   soumission bien formée — est devenu sans objet, puisqu'on n'atteint pas la soumission.
2. **La présence d'un reCAPTCHA ne prouve pas un blocage.** La version 3 est invisible et note la
   session sans toujours présenter d'épreuve. Nous avons constaté la présence du mécanisme.
3. **Nous nous interdisons de le franchir**, et cet engagement figure déjà dans le registre du
   palier C (`JOB-082`). Que le mécanisme bloque toujours ou seulement souvent, la voie automatisée
   nous est fermée **par notre propre règle** avant de l'être par la technique.

Un quatrième fait pèse autant : le canal **e-mail** vers les recruteurs (REQ-016) n'a pas de
reCAPTCHA. Rien n'y empêche un envoi autonome sous mandat.

## Decision

Nous basculons vers **« préparer en dix secondes, envoyer en un clic »** sur les canaux ATS, et nous
**conservons l'envoi autonome sur le canal e-mail**, sous mandat horodaté.

Concrètement :

- sur un canal **ATS**, l'agent prépare le dossier complet — CV adapté et relu, lettre, réponses de
  screening — et s'arrête. Le dernier geste appartient à la personne ;
- sur le canal **e-mail**, l'agent envoie seul quand le cadran est sur « agir seule » et qu'un mandat
  valide couvre ce canal ;
- le cadran d'autonomie reste **par canal** (REQ-009), et « agir seule » sur un canal ATS devient une
  valeur que le produit **refuse d'honorer** plutôt qu'une valeur interdite : la personne peut la
  choisir, l'agent explique pourquoi il ne l'exécute pas.

## Rationale

| Exigence | Comment cette décision la satisfait |
|---|---|
| Le brief impose la bascule sous 70 % de réussite | 6 % mesurés. Le seuil est franchi de très loin, et le brief prévoyait exactement ce cas. |
| « Aucun contournement d'anti-robot, jamais » (REQ-011) | La décision rend la règle **structurelle** : il n'y a plus de chemin de code où la tentation existe. |
| REQ-016 — le contact recruteur reste dans la main de l'utilisateur | Le canal e-mail garde son mandat, ses quotas et ses reçus. Le seul canal autonome est celui où l'autonomie est possible **et** encadrée. |
| REQ-013 — la preuve de ce qui est parti | Les reçus valent désormais pour les envois e-mail et pour les préparations remises à la personne : « voici ce que vous avez envoyé » reste vrai. |
| La promesse doit être tenable | Une promesse plus petite et tenue vaut mieux qu'une grande qu'on découvre creuse en trois semaines. Pour un agent autonome, c'est la seule chose qui ne se rattrape pas. |

## Consequences

**Positive**

- La promesse devient **démontrable** : trouver une offre de quatre minutes, rendre un dossier prêt
  et relu, et laisser un clic. Chaque partie est déjà construite et mesurée.
- Le risque juridique et éthique du contournement disparaît, au lieu d'être contenu par de la
  discipline.
- Le produit n'a plus besoin d'un navigateur piloté en production : moins d'infrastructure, moins de
  fragilité, moins de coût.
- Personne n'a à confier un envoi irréversible à une machine sur un canal où la machine échouerait
  huit fois sur neuf.

**Negative / trade-offs**

- **La promesse est plus petite, et il faudra le dire.** → *Mitigation :* elle est dite dès l'accueil,
  comme la couverture réelle l'est déjà (`JOB-087`). Une petite promesse tenue construit ce qu'une
  grande promesse creuse détruit.
- **Le travail de `JOB-049` (XL) est perdu s'il avait commencé.** → *Mitigation :* il n'avait pas
  commencé — c'est précisément ce que la pointe devait éviter, et elle l'a évité.
- **Le canal e-mail devient le seul chemin autonome, donc le seul chemin risqué.** → *Mitigation :*
  c'est aussi celui qui a déjà mandat, quota, plage horaire, arrêt d'urgence et reçu immuable
  (`JOB-046`, `047`, `053`, `054`). Le risque se concentre là où les gardes existent.
- **Un employeur peut fermer son offre entre la préparation et le clic.** → *Mitigation :* la file
  d'approbation archive ce qui expire et le dit (`JOB-048`), au lieu d'envoyer après coup.

## Alternatives considered

- **Basculer complètement, e-mail compris** — rejeté parce que le canal e-mail n'a aucun obstacle
  technique ni éthique, et que l'y interdire retirerait la seule autonomie réelle que le produit peut
  offrir sans rien contourner.
- **Contourner les dispositifs anti-robot** — rejeté sans hésitation. Un produit qui apprend à les
  franchir se ferme lui-même les portes qu'il veut ouvrir tous les jours, et expose ses utilisateurs
  à la fermeture de leur compte chez l'employeur.
- **Mesurer d'abord si le reCAPTCHA bloque réellement** — écarté pour cette décision, mais la mesure
  reste possible : elle changerait le chiffre, pas l'engagement, donc pas la conclusion.
- **Ne rien décider et construire `JOB-049` quand même** — rejeté : le brief demandait explicitement
  un arbitrage sous le seuil, et construire un XL sur une hypothèse mesurée fausse est la dépense que
  la pointe existait pour éviter.
