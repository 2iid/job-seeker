# ADR-0002 — Moteur de veille : registre de sources, trois paliers de fraîcheur, registre d'entreprises partagé

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** 2iD
- **Supersedes:** —
- **Related:** ADR-0001 (stack) · REQ-003, REQ-004, REQ-011

## Context

Le produit vise **tous les pays et tous les métiers**, pas seulement la tech. Cela invalide
l'approche naïve « brancher cinq connecteurs ATS et poller ».

Trois faits contraignent la conception :

1. **Les API publiques des boards ATS sont en lecture seule et couvrent mal le monde réel.**
   Greenhouse, Ashby, Lever, Workable et SmartRecruiters sont excellents sur la tech et les
   scale-ups anglophones. Ils sont marginaux pour une PME française, un poste de comptable au
   Sénégal, un emploi public ou un métier manuel. Fonder la couverture mondiale sur eux, c'est
   construire un produit qui ne sert qu'un profil.
2. **Poller tout, toutes les deux minutes, est impossible et inutile.** L'univers des employeurs est
   sans limite ; la valeur de la vitesse, elle, est concentrée sur un petit nombre d'offres qui
   comptent vraiment pour un utilisateur donné.
3. **La fraîcheur n'est pas la même selon la source, et le produit ne doit pas mentir là-dessus.**
   Un board ATS livre l'offre à la minute. Un agrégateur la livre avec un délai qu'il ne documente
   pas. Présenter les deux comme équivalents détruit la seule promesse du produit.

## Decision

Nous construirons un **registre de sources** — un cadre de connecteurs enfichables, chacun déclarant
ce qu'il couvre — organisé en **trois paliers de fraîcheur**, alimenté par un **registre
d'entreprises partagé entre tous les utilisateurs**.

**Le contrat de connecteur.** Chaque connecteur déclare : son identifiant, les **pays** et
**secteurs** qu'il couvre, sa **latence attendue**, son régime d'accès (libre, clé, conditions
d'utilisation), sa **cadence maximale**, et il renvoie des offres au format normalisé unique. Il
rapporte un **état** distinguant « aucun résultat » d'un échec. Ajouter un pays ou un secteur devient
l'écriture d'un connecteur, jamais une modification du moteur.

**Palier A — Boards surveillés (2 à 5 minutes).** Les entreprises dont le board a été résolu sont
interrogées en continu. C'est ici, et seulement ici, que la promesse « parmi les premiers » est vraie.

**Palier B — Balayage d'agrégateurs (15 à 60 minutes).** Les API officielles couvrant plusieurs pays
et tous les secteurs, plus les portails publics nationaux. C'est ce qui rend le produit utilisable
par un comptable à Dakar comme par un infirmier à Lyon. Fraîcheur moindre, couverture incomparable.

**Palier C — Plateformes assistées.** LinkedIn, Indeed, Glassdoor : détection par les canaux
autorisés uniquement, candidature préparée par l'agent et **déclenchée par l'utilisateur**. Jamais
d'automatisation headless (voir les non-objectifs du brief).

**Le registre d'entreprises partagé** est le mécanisme qui rend tout cela abordable : une entreprise
est résolue **une fois** vers son board, pour tout le monde. Un board est interrogé une fois, et le
résultat est diffusé à tous les utilisateurs dont les critères correspondent. Le coût de la veille
croît avec le nombre d'**employeurs suivis**, pas avec le nombre d'utilisateurs — c'est ce qui permet
de tenir la cadence à 2 minutes sans que la marge s'effondre.

**La découverte alimente la surveillance.** Quand une offre remonte du palier B, le moteur tente de
résoudre le board de son employeur ; s'il y parvient, l'entreprise **monte au palier A** et la
prochaine offre de cet employeur sera vue en quelques minutes au lieu d'une heure. Le produit devient
plus rapide à mesure qu'il est utilisé, sans intervention.

## Rationale

| Exigence | Comment cette décision la satisfait |
|---|---|
| Tous les pays, tous les métiers | Le palier B porte la couverture ; ajouter un marché = ajouter un connecteur, sans toucher au moteur |
| « Être parmi les premiers » | Le palier A tient la promesse là où elle a une valeur réelle, et la promotion automatique élargit son périmètre en continu |
| Honnêteté envers l'utilisateur (REQ-004) | La latence déclarée par le connecteur est affichée avec l'offre ; on ne présente jamais une offre d'agrégateur comme fraîche à la minute |
| Coût maîtrisé | Une entreprise polie une fois sert N utilisateurs ; le coût suit les employeurs, pas les inscriptions |
| Conformité aux conditions des sources | Le régime d'accès est une donnée du connecteur, contrôlable et auditable ; une source qui interdit l'automatisation est structurellement cantonnée au palier C |
| Panne d'une source (REQ-003) | Un connecteur défaillant dégrade sa propre couverture et le dit, sans empoisonner le flux ni se faire passer pour une absence d'offres |

## Consequences

**Positives**
- Le périmètre géographique et sectoriel devient une question de backlog, pas d'architecture.
- Le portage de `last30days/lib/jobs.py` (MIT) fournit gratuitement les paliers 1 et 2 du palier A :
  résolution du board depuis la page carrière, cinq fournisseurs, lecture `schema.org/JobPosting`.
- La priorisation du palier A est un levier produit clair : on peut décider de surveiller en priorité
  les employeurs que nos utilisateurs visent réellement.

**Négatives — chacune avec sa mitigation**
- **La fraîcheur est inégale selon le métier et le pays**, et un utilisateur non technique aura
  d'abord surtout du palier B. → *Mitigation :* l'affichage le dit sans détour, et la promotion
  automatique corrige progressivement. C'est l'hypothèse risquée n°5 du brief : elle se mesure sur
  trois profils réels avant d'élargir.
- **Chaque connecteur est une dépendance qui cassera un jour.** → *Mitigation :* contrat commun,
  jeux de tests par connecteur sur réponses enregistrées, état par source, alerte au changement de
  format, et dégradation isolée.
- **Le registre partagé crée un chemin de données inter-utilisateurs.** → *Mitigation :* il ne
  contient que des données **publiques** d'employeurs et d'offres. Aucune donnée de profil, aucun
  critère, aucune candidature n'y entre — frontière à vérifier explicitement en revue de sécurité.
- **Un plafond de cadence mal réglé peut faire bloquer notre adresse par une source.** → *Mitigation :*
  cadence déclarée par connecteur, retrait progressif sur `429`, et journalisation.

## Alternatives considered

- **Uniquement des connecteurs ATS** — rejeté parce que cela réduit le produit au marché tech
  anglophone, ce qui contredit la décision de viser tous les marchés et tous les métiers.
- **Uniquement des agrégateurs** — rejeté parce que la fraîcheur y est subie et non maîtrisée : on
  perdrait l'unique avantage défendable du produit.
- **Scraper largement le web des pages carrière** — rejeté parce que le coût de maintenance est sans
  fond, la qualité invérifiable, et le régime juridique variable d'un site à l'autre. La lecture de
  `schema.org/JobPosting`, elle, exploite une donnée que l'employeur publie précisément pour être
  moissonnée.
- **Ne rien décider et brancher les sources au fil de l'eau** — rejeté parce que sans contrat de
  connecteur, la dixième source réécrit le moteur, et la dette devient irrattrapable exactement au
  moment où l'internationalisation démarre.
