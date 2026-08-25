# Prompt Masterclass — Design de la plateforme de candidature autonome

> À coller tel quel dans Claude Design. Il est volontairement dense en **contraintes** et
> pauvre en **solutions** : les décisions visuelles t'appartiennent.

---

## 0. Ton rôle

Tu es **directeur artistique et designer produit senior**. Tu conçois une plateforme SaaS
qui candidate à des offres d'emploi **à la place de l'utilisateur**, de façon autonome.

Ce n'est pas un tableau de bord de plus. C'est un produit qui **agit au nom de quelqu'un**,
dans le domaine le plus chargé émotionnellement de sa vie professionnelle. Chaque décision
de design est une décision sur la **confiance**.

Tu ne produis pas « des jolies maquettes ». Tu produis un **système** : des principes, des
tokens, des composants signature, des états, et des écrans qui en découlent.

---

## 1. Le produit en une phrase

> Un agent qui surveille le marché de l'emploi en continu, détecte les offres qui
> correspondent vraiment au profil de l'utilisateur **dans les minutes qui suivent leur
> publication**, adapte son CV et sa lettre à chaque offre, postule pour lui, contacte
> directement le recruteur, et lui rend des comptes sur tout ce qu'il a fait en son nom.

### La boucle centrale (le « core loop »)

```
DÉTECTER  ──►  ÉVALUER   ──►  ADAPTER    ──►  POSTULER   ──►  RELANCER  ──►  RENDRE COMPTE
(veille       (score de     (CV + lettre   (ATS natif    (email        (chaque action
 temps réel)   pertinence    sur mesure)    ou email      recruteur,     est traçable,
               explicable)                  recruteur)    séquencé)      annulable,
                                                                         explicable)
```

**Cette boucle doit être lisible sur l'écran d'accueil, sans explication.** Un utilisateur
qui ouvre le produit pour la première fois doit comprendre en 5 secondes ce que la machine
fait pour lui pendant qu'il dort.

---

## 2. Pour qui

| Persona | Situation | Ce qu'il ressent | Ce dont il a besoin du design |
|---|---|---|---|
| **La chercheuse active** — 28 ans, dev, au chômage depuis 3 mois | Postule 20×/semaine à la main, épuisée, 2 réponses | Découragement, perte de contrôle, honte | De la **dignité**. Rendre visible l'effort accompli, jamais compter les échecs. Sensation de reprise en main. |
| **Le veilleur passif** — 35 ans, en poste, ouvert aux opportunités | Ne veut pas y passer du temps, mais ne veut rien rater | Peur de rater / peur d'être découvert | La **discrétion** et le mode « faible bruit ». Notifications rares et de haute valeur. Confidentialité affichée. |
| **Le premier emploi** — 23 ans, jeune diplômé | CV faible, ne sait pas se vendre, ne connaît pas les codes | Insécurité, syndrome de l'imposteur | De la **pédagogie**. Le produit doit lui apprendre pourquoi une offre matche et comment son CV s'améliore. |

---

## 3. Les cinq tensions à résoudre (le cœur du travail)

Ce sont les vrais problèmes de design. Un design qui ne les tranche pas est décoratif.

### T1 — Autonomie vs. contrôle
L'agent doit être assez autonome pour être utile (postuler à 3h du matin) et assez
contrôlable pour être supportable. **Comment montrer qu'une machine agit en mon nom sans
que ce soit angoissant ?** Il faut une gradation visible : *observer → proposer → agir avec
mon accord → agir seul*. L'utilisateur doit pouvoir changer de cran **en un geste**, et
depuis n'importe quel écran. Un **interrupteur d'arrêt** toujours atteignable.

### T2 — Le compte rendu, pas le log
Chaque action autonome doit produire un **reçu** lisible : *quoi, quand, pour quelle offre,
avec quel CV, quel texte exact envoyé, à qui*. Pas un journal technique — un relevé qu'on
lit comme un relevé bancaire, et où l'on peut **annuler** ou **rappeler** ce qui n'est pas
encore parti. Le design doit rendre cette page **rassurante**, pas anxiogène.

### T3 — L'urgence sans le stress
La proposition de valeur est la vitesse (« publiée il y a 4 minutes »). Mais un produit qui
clignote en rouge en permanence est invivable au quotidien. **Comment rendre la fraîcheur
d'une offre perceptible sans créer un casino ?** Interdiction formelle : compte à rebours,
badges rouges permanents, séries/streaks, confettis, tout mécanisme de gamification qui
transforme une recherche d'emploi en machine à sous.

### T4 — Expliquer le score
Chaque offre porte un score de correspondance. Un chiffre nu (« 87 % ») est de la magie et
détruit la confiance dès le premier faux positif. **Le score doit se déplier en preuves** :
ce qui correspond, ce qui manque, ce qui est rédhibitoire — et donner à l'utilisateur le
moyen de **corriger l'agent** (« non, je ne veux pas de ce type de poste ») pour que
l'apprentissage soit visible.

### T5 — La densité du suivi
Après un mois, l'utilisateur a 200 candidatures dans 8 statuts, sur 6 plateformes, avec des
fils d'emails. **Comment garder ça lisible sur un écran de téléphone ?** Le suivi doit
répondre à une seule question au premier coup d'œil : *qu'est-ce qui demande mon attention
aujourd'hui ?* Tout le reste est de l'archive consultable.

---

## 4. Principes directeurs (non négociables)

1. **Rien en mon nom sans traçabilité.** Toute action sortante est visible, datée, avec son
   contenu exact et un moyen de l'annuler avant envoi.
2. **Calme par défaut.** Le produit est un collègue compétent et discret, pas un coach qui
   hurle. Le silence est une information positive.
3. **Jamais de honte.** Aucun compteur de rejets mis en avant, aucun « vous n'avez postulé
   qu'à 2 offres cette semaine ». On valorise ce qui avance, on archive ce qui échoue.
4. **La machine explique toujours son raisonnement.** Aucun chiffre, aucune décision, aucun
   texte généré sans un « pourquoi » accessible en un clic.
5. **L'humain garde la plume.** Tout contenu généré (CV, lettre, email) est éditable, et
   l'édition est un geste de premier plan, pas une option cachée.
6. **Mobile d'abord, réellement.** La boucle « je regarde ce que l'agent a fait, j'approuve
   ou je refuse » doit être parfaitement utilisable **à une main**, dans le métro.

---

## 5. Direction de marque

### Le registre à viser
Entre **l'outil professionnel de précision** (un terminal de trading, un cockpit, un
tableau de bord d'ingénieur : dense, informatif, sérieux) et **le produit de soin** (calme,
respirant, humain). Le produit gère à la fois des **données en temps réel** et l'**anxiété
d'une personne**. Trouve le point d'équilibre — c'est là qu'est l'identité.

### Explore et propose **trois directions distinctes**
Pas trois nuances de la même idée. Trois thèses différentes sur ce qu'est ce produit.
Pour chacune : un nom, une phrase de positionnement, une palette, un couple typographique,
un artboard « écran d'accueil » et un artboard « une offre » pour juger sur pièce.
Recommande-en une, avec ton argument.

### Interdits explicites (le design sera audité là-dessus)
Ce sont les tics du design généré par IA. Leur présence sera traitée comme un défaut :
- crème + serif + terracotta ;
- quasi-noir avec une seule couleur acide/néon en accent ;
- dégradé violet→bleu en hero ;
- la grotesque « sûre » par défaut (Inter/Geist posées sans intention) ;
- emojis comme marqueurs de section ;
- tout centré ;
- un rayon d'arrondi unique appliqué à tout ;
- barre d'accent colorée sur carte arrondie ;
- toute ressemblance avec un concurrent existant du secteur RH.

### Ce qui doit exister dans le système
- **Mode sombre et mode clair traités à parité**, pas un thème inversé à la va-vite. Le
  mode sombre est le mode de veille nocturne — il doit être réellement reposant.
- **Une échelle de densité** : le suivi de candidatures a besoin de tableaux denses ; le
  studio CV a besoin d'air. Le système doit porter les deux sans se contredire.
- **Un langage de statut non chromatique** : le statut d'une candidature ne se lit jamais
  à la couleur seule (icône + libellé obligatoires, y compris pour les daltoniens).

---

## 6. Le système avant les écrans

Livre, avant toute maquette :
- **Tokens sémantiques** en variables CSS (`--surface-*`, `--text-*`, `--status-*`,
  `--score-*`, espacements, rayons, ombres, durées de transition). Nommés par **rôle**,
  jamais par valeur (`--status-applied`, pas `--blue-500`).
- **Échelle typographique** avec un cas d'usage par palier, et le comportement des **chiffres
  tabulaires** (les scores et dates s'alignent en colonne).
- **Grille et points de rupture** : 390px (référence), 768px, 1280px, 1600px.
- **Les quatre états de tout composant de données** : chargement (squelette), vide, erreur,
  trop de données. **L'état vide est l'écran d'accueil d'un nouvel utilisateur — c'est de
  l'onboarding, pas un texte gris.**

---

## 7. Inventaire des écrans

Ordonnés par priorité. Pour chacun : le travail à accomplir, le contenu clé, et les états
qui doivent être maquettés. Mobile **et** desktop pour tout ce qui est marqué ★.

### Priorité 1 — la boucle

**★ 1. Accueil / Poste de commande**
Répond à : *que s'est-il passé pendant mon absence, et qu'est-ce qui demande mon attention ?*
Contient : l'état de l'agent (actif / en pause / en attente de moi), les actions accomplies
depuis la dernière visite, la file d'approbation, les nouvelles offres à fort score, les
signaux entrants (une candidature a été consultée, un recruteur a répondu).
États : premier jour (aucune donnée), nuit calme (rien à signaler — doit être **agréable**),
journée chargée, agent bloqué (erreur d'intégration).

**★ 2. Flux d'opportunités**
Le fil temps réel des offres. Chaque offre porte : fraîcheur (« il y a 6 min »), source
(l'ATS ou la plateforme d'origine), score dépliable, statut vis-à-vis de l'agent (détectée /
en file / postulée / écartée + raison). Filtres persistants et recherches sauvegardées.
États : flux vide (aucun critère), aucune offre nouvelle, afflux massif.

**★ 3. Détail d'une offre**
Le poste, l'entreprise, le score **déplié en preuves** (correspondances / manques /
rédhibitoires), un aperçu de ce que l'agent enverrait (CV adapté + lettre), le contact
recruteur identifié, et l'action principale : *postuler maintenant* ou *approuver l'envoi*.
Inclut un **brief entreprise** : ce qui s'est passé chez elle ces 30 derniers jours, ses
signaux de recrutement, de quoi personnaliser une candidature.

**★ 4. File d'approbation**
Le mode « l'agent propose, je valide ». Conçue pour être traitée **au pouce, en 10 secondes
par élément** : approuver / modifier / refuser, avec un motif de refus qui **entraîne**
l'agent. C'est l'écran le plus utilisé du produit sur mobile — traite-le comme tel.

**★ 5. Suivi des candidatures**
Pipeline : Détectée → En file → Envoyée → Consultée → Entretien → Offre → Refusée / Sans
suite. Vue kanban desktop, vue liste priorisée mobile. Le détail d'une candidature affiche
**le reçu** : le CV exact envoyé, la lettre exacte, l'horodatage, le canal, le fil d'emails,
les relances programmées.
États : 0, 12, 200+ candidatures (la lisibilité à 200 est le vrai test).

### Priorité 2 — la matière

**6. Console de l'agent** — Les règles : ce qu'il cherche, ce qu'il exclut (entreprises
blacklistées, mots-clés rédhibitoires), le rythme (quota quotidien), le niveau d'autonomie
par canal (ATS / email recruteur / plateforme), les plages horaires. Un **journal d'activité**
lisible et un **arrêt d'urgence**. Le défi : rendre configurable sans faire un formulaire de
40 champs — pense en **phrases lisibles** plutôt qu'en cases à cocher.

**7. Studio CV** — Le profil canonique (une seule vérité de carrière) et ses **variantes**
par type de poste. Analyse de lisibilité ATS, écart de mots-clés face à une offre donnée,
**vue de différence** entre le CV maître et la version adaptée (l'utilisateur doit voir
exactement ce que la machine a changé et pouvoir refuser une modification). Import depuis
un PDF existant ou LinkedIn, avec l'écran de **confirmation de l'extraction** (le moment où
l'on corrige ce que la machine a mal lu — écran critique, souvent bâclé).

**8. Bibliothèque de réponses** — Les questions de screening récurrentes (prétentions
salariales, autorisation de travail, disponibilité, mobilité, questions ouvertes) et leurs
réponses validées, que l'agent réutilise. Plus la lettre de motivation et les documents
demandés.

**9. Contacts recruteurs & prise de contact** — Les personnes identifiées, l'email rédigé
par l'agent, l'état de délivrabilité, les relances séquencées, et un cadre de conformité
visible (consentement, désinscription, limite d'envoi). Le design doit **empêcher** que ça
ressemble à un outil de spam.

### Priorité 3 — la profondeur

**10. Analyse** — L'entonnoir de conversion, le taux de réponse par source / variante de CV /
heure d'envoi, le délai jusqu'à la première réponse, les enseignements du marché. Objectif :
donner de la **stratégie**, pas des vanity metrics. Aucun graphique qui ne débouche pas sur
une décision.

**11. Préparation d'entretien** — Déclenché quand une candidature passe en entretien : brief
entreprise récent, profil des interlocuteurs, questions probables, réponses à préparer.

**12. Réglages** — Intégrations (email, agenda), notifications (avec un vrai mode discret),
abonnement, **confidentialité et données** (export, suppression, journal d'audit RGPD).

**13. Onboarding** — Le parcours de la première fois : importer le CV → confirmer
l'extraction → définir la cible → régler l'autonomie → **voir l'agent trouver sa première
offre en direct**. Ce dernier moment est la promesse du produit : conçois-le comme le point
culminant, pas comme la fin d'un formulaire.

---

## 8. Composants signature à inventer

Ce sont eux qui donneront son identité au produit. N'utilise pas de composants génériques
pour ces cinq-là :

1. **L'indicateur de score** — un chiffre qui se déplie en preuves. Doit fonctionner en
   version compacte (dans une liste dense) et en version développée (sur le détail).
2. **La ligne de vie de l'agent** — la chronologie des actions autonomes. Doit rendre lisible
   « ce qu'une machine a fait pendant la nuit » sans ressembler à un log serveur.
3. **La carte d'approbation** — l'unité de la file d'approbation. Décision au pouce, contenu
   complet consultable, trois issues possibles.
4. **Le reçu de candidature** — la preuve de ce qui a été envoyé. Doit inspirer la même
   confiance qu'un justificatif administratif, sans en avoir la froideur.
5. **L'indicateur de fraîcheur** — communiquer « publiée il y a 4 minutes, tu es dans les 10
   premiers » **sans urgence toxique**. C'est le composant le plus difficile du lot.

---

## 9. Ton et micro-copie

- **Sobre, précis, adulte.** L'agent parle à la première personne du singulier quand il rend
  compte de ses actes (« J'ai postulé chez X à 03h12 »), jamais avec un « nous » corporate.
- **Les erreurs sont utiles** : ce qui a échoué, pourquoi, ce que je peux faire. Jamais
  « Oups ! Quelque chose s'est mal passé ».
- **Un refus n'est jamais un échec de l'utilisateur.** Le langage l'énonce comme une donnée
  du marché, pas comme un jugement.
- **Interdits** : le ton faussement enjoué, les points d'exclamation en série, les métaphores
  de chasse ou de guerre (« traquer », « décrocher le job », « combat »), l'emoji fusée.
- Toute la micro-copie existe en **français et en anglais**, et les deux sont conçues, pas
  traduites après coup.

---

## 10. Accessibilité, responsive, international

- **WCAG 2.1 AA mesuré, pas estimé** : 4,5:1 pour le texte courant, 3:1 pour le grand texte
  et les parties non textuelles des contrôles. Anneau de focus visible, jamais supprimé.
- **Cibles tactiles ≥ 44px** avec un espacement réel. Un tableau dense de bureau réduit à
  390px n'est pas responsive, c'est un piège à pouce — conçois une vue mobile distincte.
- **Navigation clavier complète** sur la file d'approbation et le flux d'offres : ce sont des
  écrans de traitement en série, ils méritent des raccourcis.
- **`prefers-reduced-motion` respecté**, et rien d'important communiqué par le mouvement seul.
- **i18n FR/EN** : vérifie chaque écran à 390px avec les chaînes françaises (~20 % plus
  longues que l'anglais). Rien ne se tronque.
- **Ce produit affiche des données très sensibles** (CV, salaires, candidatures secrètes
  pendant qu'on est en poste). Prévois un **mode discrétion** qui masque les identifiants
  d'entreprise en un geste — on consulte ce produit dans un open space.

---

## 11. Ce que tu livres

1. **Trois directions de marque** (§5), chacune avec les deux artboards de jugement, puis
   ta recommandation argumentée.
2. **Le système** : tokens sémantiques nommés, échelle typographique, grille, états
   génériques — en clair et en sombre.
3. **Les écrans de priorité 1**, en mobile **et** desktop, avec les états listés (jamais
   seulement le cas heureux).
4. **Les écrans de priorité 2 et 3**, au moins en desktop.
5. **Les cinq composants signature** spécifiés : anatomie, variantes, états, comportement
   responsive, comportement clavier.
6. **Deux parcours** maquettés bout en bout : *première utilisation → première candidature
   autonome* et *notification → approbation → reçu*, sur mobile.
7. **Les user stories de design** — une liste au format `En tant que <persona>, je veux
   <capacité>, afin de <bénéfice>`, chacune assortie de ses **critères d'acceptation
   vérifiables** (états couverts, contraste, cible tactile, comportement clavier, chaîne la
   plus longue à 390px). Cette liste sera importée telle quelle dans le backlog produit :
   écris-la pour être lue par un ingénieur, pas par un jury de design.

---

## 12. Critères d'acceptation du design lui-même

Le design sera considéré comme réussi si :

- [ ] La boucle centrale est compréhensible en 5 secondes sur l'accueil, sans onboarding.
- [ ] L'utilisateur peut arrêter l'agent depuis n'importe quel écran, en un geste.
- [ ] Aucun chiffre affiché n'est sans explication accessible en un clic.
- [ ] La file d'approbation se traite à une main, à 390px, en moins de 10 s par élément.
- [ ] Le suivi reste lisible à 200 candidatures.
- [ ] Chaque composant de données possède ses quatre états, l'état vide faisant office
      d'onboarding.
- [ ] Aucun élément de la liste d'interdits du §5 n'est présent.
- [ ] Contrastes mesurés et conformes en clair **et** en sombre.
- [ ] Les écrans tiennent en français à 390px sans troncature.
- [ ] Un utilisateur anxieux se sent **plus** en contrôle après avoir utilisé le produit,
      pas moins. C'est le critère qui prime sur tous les autres.
