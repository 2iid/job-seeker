# Spécification fonctionnelle

> Ce que le produit fait, domaine par domaine et rôle par rôle, sous forme d'histoires testables.

## Comment lire ce document

Chaque histoire **MUST** porte un identifiant stable `REQ-###`. Les critères d'acceptation
correspondent 1 pour 1 à des tests, aux contrôles de la Definition of Done, et à la colonne `req`
du tableau Kanban. Un identifiant n'est **jamais** renuméroté ni réutilisé. Les histoires SHOULD /
COULD restent en prose, sans identifiant.

Le MVP compte **15 exigences MUST actives**. Toute seizième oblige à en retirer une : c'est ce qui
s'est produit le 2026-08-25, quand le contact recruteur assisté est entré au MVP — **REQ-006 a été
retirée du MVP et reportée en v1.1**, et son identifiant est retiré définitivement, jamais réattribué.
Les données dont elle a besoin sont malgré tout collectées dès le premier jour (REQ-010), pour que le
report ne coûte rien.

---

## Acteurs

Chaque acteur porte un **critère de refus** : la chose qu'il ne doit jamais pouvoir faire. C'est
cette colonne qui produit les tests de refus.

| Acteur | Nature | Peut faire | DOIT être refusé |
|---|---|---|---|
| **Candidat** | utilisateur final | Gérer son profil et ses CV, définir ses critères et son cran d'autonomie, approuver / modifier / refuser une candidature, consulter ses reçus, exporter et supprimer ses données | Lire ou modifier la moindre ligne appartenant à un autre candidat ; déclencher un envoi sortant sur un canal dont il n'a pas signé le mandat |
| **Opérateur / support** | interne | Voir l'état technique d'un compte (files, erreurs de connecteur, quotas, facturation) | Lire le contenu d'un CV, d'une lettre, d'un email ou d'un fil de messagerie ; agir au nom d'un candidat |
| **Board ATS / agrégateur** | système externe (entrant) | Fournir des offres publiques en lecture | Voir son contenu interprété comme une instruction par l'agent ; être appelé au-delà de la cadence déclarée |
| **Page de candidature ATS** | système externe (sortant) | Recevoir une candidature soumise pour le compte du candidat | Recevoir une soumission sans mandat valide, hors quota, ou après un arrêt d'urgence |
| **Fournisseur LLM** | sous-traitant | Recevoir le profil et le texte de l'offre pour scorer et rédiger | Recevoir des données dont il n'a pas besoin pour la tâche en cours ; voir ses sorties exécutées sans validation de schéma |
| **Fournisseur de messagerie** | sous-traitant + système externe | Restituer les fils liés à une candidature ; envoyer un email approuvé par le candidat | Être lu au-delà des portées consenties ; envoyer sans approbation explicite |
| **Recruteur** | tiers concerné | — (n'a pas de compte) | Voir ses données conservées sans finalité, ou recevoir un envoi automatique en masse |
| **Régulateur / auditeur** | contrôle | Exiger l'export, la suppression, le registre des actions et la preuve du mandat | — |
| **Attaquant** | hostile | — | Exfiltrer le CV ou l'historique d'un autre utilisateur ; faire partir un envoi au nom d'un utilisateur ; **faire exécuter une instruction dissimulée dans le texte d'une offre d'emploi** ; forger ou altérer un reçu |

---

## Profil et documents

#### REQ-001 · MUST — Import de CV avec confirmation de l'extraction

**Histoire :** En tant que candidat, je veux importer mon CV existant et **corriger ce que la machine
a mal lu**, afin que tout ce que le produit fera ensuite parte de données exactes.

- **Critères d'acceptation :**
  - [ ] Un PDF ou DOCX importé produit un profil structuré (identité, expériences, formations,
        compétences, langues) présenté champ par champ **avant** enregistrement.
  - [ ] Chaque champ extrait est éditable, et un champ dont la confiance d'extraction est basse est
        signalé visuellement comme à vérifier.
  - [ ] Un fichier illisible, chiffré, vide ou de plus de 10 Mo produit un message qui dit quoi faire,
        et ne crée aucun profil partiel.
  - [ ] Le fichier d'origine est conservé et re-téléchargeable par son propriétaire uniquement.
  - [ ] **Refus :** un autre candidat authentifié ne peut lire ni le fichier ni le profil extrait —
        vérifié par un test de refus au niveau de la base, pas seulement de l'API.
- **Notes :** tables `profiles`, `profile_experiences`, `documents` ; stockage objet privé.

#### REQ-002 · MUST — Profil canonique et critères de recherche

**Histoire :** En tant que candidat, je veux décrire une seule fois qui je suis et ce que je cherche,
afin que l'agent travaille sur une cible que j'ai définie et pas devinée.

- **Critères d'acceptation :**
  - [ ] Le candidat définit : intitulés visés, séniorité, distanciel / hybride / présentiel, zones
        géographiques, fourchette salariale, secteurs, langues, autorisation de travail, disponibilité.
  - [ ] Il définit des **exclusions** : entreprises interdites, mots-clés rédhibitoires — et une offre
        exclue n'est jamais présentée, jamais scorée, jamais soumise.
  - [ ] Un changement de critères est daté et versionné : on peut expliquer *a posteriori* pourquoi
        une offre a matché à un instant donné.
  - [ ] Le profil reste utilisable tant que les critères sont incomplets : le produit indique ce qui
        manque pour activer l'automatisation, sans bloquer la navigation.

#### REQ-007 · MUST — CV adapté à l'offre, avec vue de différence

**Histoire :** En tant que candidat, je veux voir **exactement** ce que la machine a changé dans mon
CV pour cette offre, et refuser chaque modification une par une, afin de ne jamais envoyer une
affirmation que je ne tiendrais pas en entretien.

- **Critères d'acceptation :**
  - [ ] La version adaptée s'affiche en différence face au CV maître, modification par modification.
  - [ ] Chaque modification peut être acceptée ou refusée individuellement ; un refus est définitif
        pour cette candidature.
  - [ ] Le générateur ne peut **ni ajouter une expérience, ni un diplôme, ni une compétence, ni
        modifier une date** absente du profil canonique — contrainte vérifiée par un test automatisé
        sur la sortie, pas par une consigne au modèle.
  - [ ] Export PDF fidèle à l'aperçu, avec un texte réellement sélectionnable (lisible par un ATS).
  - [ ] Le CV est mis au **format attendu par le marché de l'offre** : les conventions diffèrent
        nettement d'un pays à l'autre (présence ou absence de photo, de date de naissance, de
        nationalité, de situation familiale ; longueur admise ; ordre des rubriques). Une donnée que
        le marché visé proscrit est **omise et non transmise**, et le produit dit pourquoi.
  - [ ] **Refus :** aucune candidature ne peut être soumise avec un CV non revu au moins une fois sur
        ce canal.

#### REQ-008 · MUST — Lettre de motivation et bibliothèque de réponses

**Histoire :** En tant que candidat, je veux que les lettres et les questions de screening soient
pré-remplies à partir de réponses que j'ai validées, afin de ne pas réécrire vingt fois les mêmes
phrases.

- **Critères d'acceptation :**
  - [ ] Une lettre est générée à partir du profil, de l'offre et du brief entreprise, et reste
        entièrement éditable.
  - [ ] Les réponses récurrentes (prétentions, disponibilité, mobilité, autorisation de travail,
        questions ouvertes) sont stockées, réutilisées et éditables.
  - [ ] Une question de screening sans réponse validée **bloque la soumission automatique** et part en
        file d'approbation — elle n'est jamais inventée.
  - [ ] Les documents sont rédigés dans **la langue de l'offre**, détectée automatiquement et
        corrigeable en un geste. Si la langue détectée n'est pas maîtrisée d'après le profil, le
        produit le signale avant envoi plutôt que de produire un texte que le candidat ne pourra pas
        défendre en entretien.

## Veille et correspondance

#### REQ-003 · MUST — Connecteurs de sources, normalisation, déduplication

**Histoire :** En tant que candidat, je veux que le produit surveille les sources en continu, afin de
voir les offres au moment où elles paraissent et non le lendemain.

- **Critères d'acceptation :**
  - [ ] Tout connecteur implémente le **contrat unique** d'ADR-0002 : il déclare son identifiant, les
        **pays** et **secteurs** couverts, sa **latence attendue**, son régime d'accès et sa cadence
        maximale, et renvoie des offres au format normalisé. Ajouter un marché n'exige aucune
        modification du moteur — vérifié par un test qui enregistre un connecteur factice.
  - [ ] **Palier A** — au moins cinq connecteurs ATS (Greenhouse, Ashby, Lever, Workable,
        SmartRecruiters) plus la lecture `schema.org/JobPosting` d'une page carrière, interrogés
        toutes les 2 à 5 minutes.
  - [ ] **Palier B** — au moins trois connecteurs d'agrégateurs ou de portails publics sous API
        officielle, couvrant **plusieurs pays et tous secteurs**, balayés toutes les 15 à 60 minutes.
  - [ ] Une entreprise est résolue vers son board **une seule fois pour tous les utilisateurs** ; un
        board est interrogé une fois et diffusé à tous les profils correspondants. Le registre
        d'entreprises ne contient **aucune** donnée d'utilisateur — testé comme un refus.
  - [ ] Une offre remontée du palier B déclenche une tentative de résolution du board de son
        employeur ; en cas de succès l'entreprise **monte au palier A**.
  - [ ] La même offre vue sur deux sources ou deux paliers produit **une seule** entrée, avec ses
        sources listées et la **meilleure** latence retenue.
  - [ ] Chaque source déclare un état distinguant « aucun résultat » d'un échec (indisponible,
        quota atteint, format modifié) — un échec n'est **jamais** présenté comme une absence d'offres.
  - [ ] La cadence d'appel par domaine est plafonnée et respectée ; un `429` déclenche un retrait
        progressif et est journalisé.
  - [ ] Un connecteur dont le format change échoue proprement, alerte, et n'empoisonne pas le flux
        avec des entrées partielles — sa couverture se dégrade seule, sans entraîner les autres.
- **Notes :** portage TypeScript des paliers de `last30days/lib/jobs.py` (MIT) pour le palier A —
  voir ADR-0002. Les salaires sont normalisés en devise et en périodicité à l'entrée du moteur ; les
  dates de publication sont stockées en UTC avec le fuseau d'origine.

#### REQ-004 · MUST — Flux d'opportunités avec fraîcheur et provenance

**Histoire :** En tant que candidat, je veux un flux des offres qui me correspondent avec leur âge
réel et leur source, afin de savoir si je suis en avance et d'où vient l'information.

- **Critères d'acceptation :**
  - [ ] Chaque entrée affiche l'âge depuis publication, la source d'origine, le score, et son statut
        vis-à-vis de l'agent (détectée / en file / soumise / écartée + motif).
  - [ ] L'affichage distingue **une offre vue à la minute (palier A) d'une offre remontée par un
        agrégateur (palier B)**. Une latence de palier B n'est jamais présentée comme une fraîcheur de
        palier A — c'est la seule promesse du produit, elle ne se surestime pas.
  - [ ] Salaires affichés dans la devise de l'offre **et** convertis dans celle de l'utilisateur, la
        conversion étant identifiée comme telle avec sa date de taux.
  - [ ] Filtres et recherches sauvegardées persistants entre sessions.
  - [ ] Les quatre états sont livrés : chargement, vide, erreur, afflux — l'état vide expliquant quoi
        faire pour que le flux se remplisse.
  - [ ] Le flux reste utilisable à 500 entrées sur un écran de 390 px.

#### REQ-005 · MUST — Score de correspondance explicable

**Histoire :** En tant que candidat, je veux savoir **pourquoi** une offre m'est proposée, afin de
pouvoir faire confiance à l'agent — ou le corriger.

- **Critères d'acceptation :**
  - [ ] Tout score affiché se déplie en trois listes citant le texte de l'offre : ce qui correspond,
        ce qui manque, ce qui est rédhibitoire.
  - [ ] Un critère rédhibitoire non satisfait (autorisation de travail, langue, présence exigée hors
        zone) empêche la soumission automatique quel que soit le score.
  - [ ] Le calcul est reproductible : rejouer le score d'une candidature passée redonne la même
        explication à partir des données conservées.
  - [ ] **Refus :** aucun score n'est affiché sans explication accessible.

#### REQ-006 · ~~MUST~~ → **retirée du MVP le 2026-08-25, reportée en v1.1**

> Retirée pour laisser entrer REQ-016 sans dépasser 15 exigences MUST. **L'identifiant REQ-006 est
> retiré définitivement et ne sera jamais réattribué.** Les motifs de refus sont malgré tout collectés
> dès le MVP par REQ-010 : quand cette exigence reviendra, elle aura des données réelles à exploiter
> au lieu de repartir de zéro. Le texte ci-dessous est conservé tel quel pour la v1.1.

##### (v1.1) Correction du score par le candidat

**Histoire :** En tant que candidat, je veux dire à l'agent qu'il s'est trompé, afin qu'il se trompe
moins la fois suivante et que je voie qu'il a appris.

- **Critères d'acceptation :**
  - [ ] Un refus d'offre demande un motif dans une liste courte (mauvais poste, mauvaise entreprise,
        salaire, localisation, séniorité, autre).
  - [ ] Le motif modifie les scores suivants de façon observable, et le produit dit ce qu'il a retenu
        en une phrase.
  - [ ] Le candidat peut consulter et annuler les préférences apprises — rien n'est appris en secret.

## Gouvernance de l'agent

#### REQ-009 · MUST — Cadran d'autonomie, mandat et quotas

**Histoire :** En tant que candidat, je veux choisir jusqu'où l'agent va, canal par canal, afin de
lui donner ma confiance progressivement plutôt que d'un coup.

- **Critères d'acceptation :**
  - [ ] Quatre crans par canal : observer, proposer, agir après mon accord, agir seul.
  - [ ] Passer un canal à « agir seul » exige un **mandat explicite** horodaté et conservé, précédé
        d'un aperçu intégral de ce qui sera envoyé.
  - [ ] Quota quotidien et plages horaires respectés ; le quota atteint met en file, ne jette rien.
  - [ ] **Refus :** aucune action sortante ne part sur un canal sans mandat en cours de validité,
        vérifié au moment de l'exécution et pas seulement à la mise en file.

#### REQ-010 · MUST — File d'approbation

**Histoire :** En tant que candidat, je veux valider ou refuser en quelques secondes ce que l'agent
propose, afin de garder la main sans y passer ma journée.

- **Critères d'acceptation :**
  - [ ] Chaque élément montre l'offre, le score, et **le contenu exact** qui partirait.
  - [ ] Trois issues : approuver, modifier puis approuver, refuser avec motif (qui alimente REQ-006).
  - [ ] Utilisable à une main à 390 px, et entièrement au clavier sur poste fixe.
  - [ ] Un élément non traité avant l'expiration de l'offre est archivé avec son motif, jamais envoyé
        en silence après coup.

#### REQ-011 · MUST — Soumission de candidature avec escalade obligatoire

**Histoire :** En tant que candidat, je veux que l'agent soumette ma candidature sur le site de
l'employeur, et **s'arrête pour me demander** dès qu'il n'est plus sûr.

- **Critères d'acceptation :**
  - [ ] Une soumission réussie enregistre la confirmation obtenue (page, référence, email d'accusé).
  - [ ] Un champ obligatoire inconnu, une question sans réponse validée, un téléversement refusé ou
        un **anti-robot** interrompent la soumission et créent un élément d'approbation expliquant le
        blocage. **Aucun contournement d'anti-robot n'est tenté, jamais.**
  - [ ] Une soumission n'est jamais rejouée à l'identique : un doublon sur la même offre est détecté
        et refusé, même après un incident ou un redémarrage du worker.
  - [ ] **Refus :** le texte d'une offre ne peut déclencher aucune action — instruction dissimulée,
        adresse de contact inattendue, redirection. Toute destination sortante provient de données
        vérifiées côté serveur, jamais du contenu récupéré. *(Test d'injection obligatoire.)*
  - [ ] Un échec est réessayé avec retrait progressif, borné, puis escaladé à l'humain.

#### REQ-012 · MUST — Arrêt d'urgence

**Histoire :** En tant que candidat, je veux tout arrêter immédiatement, afin de n'avoir jamais à
espérer que la machine s'arrête.

- **Critères d'acceptation :**
  - [ ] Atteignable depuis n'importe quel écran, en un geste, sans confirmation à plusieurs étapes.
  - [ ] Effectif en moins de 5 secondes : les travaux en file sont annulés, ceux en cours d'exécution
        sont interrompus au prochain point de contrôle, et le produit dit précisément ce qui est parti
        avant l'arrêt.
  - [ ] La reprise est un acte explicite ; rien ne redémarre tout seul, y compris après un
        redéploiement.

## Traçabilité et conformité

#### REQ-013 · MUST — Reçu de candidature

**Histoire :** En tant que candidat, je veux la preuve exacte de ce qui a été envoyé en mon nom, afin
de savoir ce que le recruteur a réellement reçu.

- **Critères d'acceptation :**
  - [ ] Toute action sortante produit un reçu : offre, canal, horodatage, **le CV exact et le texte
        exact envoyés**, le résultat, et le cran d'autonomie en vigueur à cet instant.
  - [ ] Le reçu est immuable : ni le candidat, ni le support, ni le worker ne peuvent le modifier
        après écriture — vérifié par un test de refus.
  - [ ] Une action sans reçu est un incident : le produit alerte plutôt que de laisser un trou.
  - [ ] Le reçu est consultable et exportable par son propriétaire.

#### REQ-014 · MUST — Export, suppression et journal d'audit

**Histoire :** En tant que candidat, je veux emporter ou effacer mes données quand je veux, afin de
rester propriétaire de mon histoire professionnelle.

- **Critères d'acceptation :**
  - [ ] Export en libre-service, complet et lisible par une machine, en moins de 24 h.
  - [ ] Suppression dure en libre-service : profil, CV, documents générés, reçus, fils de messagerie
        et données de recruteurs associées — avec confirmation de ce qui subsiste en obligation légale
        et pourquoi.
  - [ ] Une suppression annule d'abord toute automatisation en cours ; aucun envoi ne peut partir pour
        un compte en cours de suppression.
  - [ ] Journal d'audit sur les accès et actions sensibles, y compris ceux du support.
  - [ ] **Refus :** le support ne peut pas lire le contenu des documents et des messages, quel que
        soit son rôle applicatif — testé au niveau de la base.

#### REQ-015 · MUST — Suivi des candidatures et détection des réponses

**Histoire :** En tant que candidat, je veux voir où en est chaque candidature sans fouiller ma boîte
mail, afin de savoir chaque matin ce qui demande mon attention.

- **Critères d'acceptation :**
  - [ ] Pipeline : détectée → en file → envoyée → consultée → entretien → offre → refusée / sans suite,
        avec transitions manuelles toujours possibles.
  - [ ] Après consentement OAuth, les réponses reçues sont rattachées à la bonne candidature et
        remontent le statut ; le rattachement erroné est corrigeable en un geste.
  - [ ] Aucun email hors des fils liés à une candidature n'est lu ni conservé — testé.
  - [ ] Le suivi reste lisible et navigable à 200 candidatures, mobile compris.
  - [ ] Une vue « demande mon attention aujourd'hui » distincte de l'archive.

## Contact direct

#### REQ-016 · MUST — Contact recruteur assisté

**Histoire :** En tant que candidat, je veux écrire directement à la personne qui recrute, avec un
message préparé pour moi, afin de sortir de la file d'attente des candidatures anonymes.

- **Critères d'acceptation :**
  - [ ] Le produit propose les contacts qu'il a pu identifier pour une offre, **chacun avec sa source
        et son niveau de certitude**. Une adresse devinée est présentée comme devinée, jamais comme un
        fait.
  - [ ] L'email est rédigé à partir du profil, de l'offre et du brief entreprise, et reste
        entièrement éditable avant envoi.
  - [ ] **L'envoi part de la boîte du candidat, après son approbation explicite, message par message.**
        Aucun envoi automatique, aucune relance automatique, aucun envoi groupé — la fonction d'envoi
        n'existe simplement pas côté serveur au MVP.
  - [ ] Chaque envoi produit un reçu (REQ-013) et le message est rattaché au suivi (REQ-015).
  - [ ] Les données de recruteur ont une durée de conservation bornée, sont supprimées avec la
        candidature, et une demande d'opposition est traitable (OBL-3).
  - [ ] **Refus :** l'adresse de destination ne peut jamais provenir du contenu récupéré d'une offre —
        même contrainte d'injection que REQ-011, testée séparément ici.
- **Notes :** identification via les signaux publics ; l'automatisation complète des séquences est un
  non-objectif explicite de cette phase.

---

## SHOULD / COULD *(sans identifiant tant que ce n'est pas MUST)*

- **Correction du score par le candidat** — l'ex-REQ-006, reportée en v1.1 ; les motifs de refus sont
  déjà collectés.
- **Séquences de relance autonomes vers les recruteurs** — v2, avec base légale, mécanisme
  d'opposition et infrastructure de délivrabilité.
- **Brief entreprise et préparation d'entretien** — les 30 derniers jours de l'entreprise et ses
  signaux de recrutement, via l'export JSON de `last30days`.
- **A/B des variantes de CV** — quelle version obtient des réponses, sur quelle source, à quelle heure.
- **Mode discrétion** — masquer les noms d'entreprise en un geste, notifications silencieuses.
- **Analyse de l'entonnoir** — taux de réponse par source, par variante, par délai de candidature.

## Exigences transverses

- **i18n :** interface en **français (défaut) et anglais**, avec vérification de chaque écran à
  390 px sur les chaînes françaises. Les **documents générés** suivent la langue de l'offre, pas celle
  de l'interface. Devises, fuseaux horaires et formats de date sont ceux de l'offre, convertis pour
  l'utilisateur et identifiés comme conversions. Les plages horaires de l'agent (REQ-009) sont
  exprimées dans le fuseau du candidat.
- **Accessibilité :** WCAG 2.1 AA mesuré — contraste ≥ 4,5:1, focus visible, navigation clavier
  complète sur le flux et la file d'approbation, `prefers-reduced-motion` respecté, aucun statut
  communiqué par la couleur seule.
- **Notifications :** sobres par défaut. Seuls trois événements notifient hors application — une
  réponse de recruteur, un agent bloqué, un élément d'approbation qui va expirer.
- **Sécurité :** RLS par utilisateur avec tests d'autorisation **et de refus** sur chaque table
  portant des données personnelles ; le contenu d'offre traité comme entrée hostile partout où il
  atteint un LLM ; `security-review` obligatoire sur authentification, envoi sortant, paiement et
  contexte IA.

## Non-objectifs explicites de cette phase

- Aucune automatisation headless sur LinkedIn, Indeed ou Glassdoor.
- Aucun contournement d'anti-robot.
- Aucune séquence d'emails autonome vers des recruteurs.
- Aucune fonction employeur ni place de marché.
- Aucun conseil juridique, fiscal ou salarial personnalisé.
