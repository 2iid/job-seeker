# Project brief — job-seeker *(nom de code — à remplacer, voir Questions ouvertes)*

> LE PLAN DE RÉFÉRENCE. `/bootstrap` lit ce fichier et ne pose que les questions qu'il laisse
> ouvertes. Chaque réponse ici est une question qu'on ne repose pas.

- **Date :** 2026-08-25 · **À confirmer par :** 2iD

---

## Le problème

Postuler à un emploi est devenu un jeu de vitesse et de volume que le candidat ne peut plus jouer
à la main. Sur les plateformes grand public, une offre attractive accumule des centaines de
candidatures dans les 24 h qui suivent sa publication, et les études du secteur convergent sur un
point : les premières candidatures reçues sont vues, les suivantes sont filtrées. Aujourd'hui, le
candidat fait ceci à la place : il consulte LinkedIn ou Indeed une à deux fois par jour, découvre
l'offre avec 6 à 48 h de retard, réécrit son CV à la main pour chaque poste, et abandonne au bout
de trois semaines. Le coût : des mois de recherche supplémentaires, et une sélection qui récompense
la disponibilité plutôt que la compétence.

## L'utilisateur

**La chercheuse active** — développeuse, 28 ans, sans poste depuis trois mois, postule à une
vingtaine d'offres par semaine à la main pour deux réponses. **Son travail n°1 : obtenir plus
d'entretiens sans y consacrer plus de temps.** Elle n'achète pas « de l'automatisation », elle
achète du temps rendu et la fin d'un sentiment d'impuissance.

Deux utilisateurs secondaires changent le design et sont donc retenus : **le veilleur en poste**
(exige la discrétion et un très faible bruit de notification — c'est lui qui impose le mode
discrétion et la sobriété des alertes) et **le jeune diplômé** (exige que le produit explique et
enseigne — c'est lui qui impose l'explicabilité du score et de chaque modification du CV).

## La boucle centrale

```
DÉTECTER  →  ÉVALUER  →  ADAPTER  →  POSTULER  →  RENDRE COMPTE
```

1. **Déclencheur :** un connecteur détecte une offre nouvellement publiée sur le board ATS d'une
   entreprise suivie, en général quelques minutes après sa mise en ligne.
2. **Ce que fait le produit :** il la score contre le profil, adapte le CV et rédige la lettre,
   puis — selon le cran d'autonomie choisi — soumet la candidature ou la place en file d'approbation.
3. **Ce que l'utilisateur fait :** rien, ou dix secondes d'approbation au pouce.
4. **Ce qu'il récupère :** un reçu — l'offre, le score et ses preuves, le contenu exact envoyé,
   l'horodatage, le canal.
5. **Ce qui le ramène :** les réponses des recruteurs remontent dans le suivi, et le tableau de
   bord lui montre chaque matin ce qui a avancé pendant qu'il dormait.

## Périmètre du MVP

Le plus petit produit qui rende cette boucle réelle.

1. **Profil et CV** — import d'un CV PDF, extraction structurée, **écran de confirmation de
   l'extraction**, profil canonique, préférences de recherche (distanciel / hybride / présentiel,
   salaire, localisation, séniorité, secteurs, entreprises exclues).
2. **Moteur de veille à trois paliers** (ADR-0002) — palier A : boards ATS surveillés toutes les
   2–5 min (Greenhouse, Ashby, Lever, Workable, SmartRecruiters, plus la lecture
   `schema.org/JobPosting`) ; palier B : agrégateurs et portails publics sous API officielle,
   balayés toutes les 15–60 min, qui portent la couverture **mondiale et tous secteurs** ; palier C :
   plateformes assistées. Registre d'entreprises partagé, normalisation, déduplication inter-sources,
   fraîcheur affichée honnêtement palier par palier.
3. **Score de correspondance explicable** — un chiffre qui se déplie en correspondances, manques et
   rédhibitoires, corrigeable par l'utilisateur.
4. **Génération de documents** — CV adapté à l'offre avec **vue de différence** et refus modification
   par modification, lettre de motivation, bibliothèque de réponses aux questions de screening.
5. **Candidature et prise de contact** — soumission sur le formulaire public de l'ATS, avec
   **escalade obligatoire à l'utilisateur** dès qu'un champ est inconnu ou qu'un anti-robot apparaît ;
   et, en parallèle, identification du responsable du recrutement avec un email personnalisé rédigé
   par l'agent que **l'utilisateur envoie depuis sa propre boîte** après relecture.
6. **Gouvernance de l'agent** — cadran d'autonomie par canal, quota quotidien, plages horaires,
   file d'approbation, arrêt d'urgence, journal d'audit.
7. **Suivi et tableau de bord** — pipeline des candidatures, reçus, détection des réponses dans la
   boîte mail de l'utilisateur.

## Hors périmètre *(enregistré pour ne pas être rediscuté en cours de sprint)*

- **Aucune automatisation headless sur LinkedIn, Indeed ou Glassdoor.** Elle viole leurs conditions
  d'utilisation et fait restreindre le compte de notre propre client. Ces plateformes existent dans
  le produit en **mode assisté** : détection de l'offre, CV et lettre pré-générés, envoi déclenché
  par l'utilisateur lui-même. Cette ligne n'est pas négociable et sera réaffirmée à chaque sprint.
- **Aucun envoi ni aucune relance autonomes vers les recruteurs au MVP.** Le contact direct *est* au
  MVP, mais en mode assisté : l'agent identifie et rédige, l'utilisateur relit et envoie depuis sa
  propre boîte (REQ-016). Les séquences autonomes avec relances arrivent en v2, une fois la base
  légale, le mécanisme d'opposition et la délivrabilité (SPF/DKIM/DMARC, réchauffage de domaine)
  réellement outillés — et notre domaine n'est alors plus l'expéditeur d'un inconnu.
- Pas d'application mobile native — une PWA responsive, mobile d'abord.
- Pas de contournement d'anti-robot, jamais, sous aucune configuration. Un CAPTCHA rend la main.
- Pas de place de marché côté recruteur, pas de fonctions employeur.
- Pas de langue au-delà du français et de l'anglais.

## Contraintes

- **Stack :** décidée — Next.js 15 + Supabase (Postgres / Auth / Storage / Realtime, avec RLS) +
  Stripe + API Claude, **plus un service worker conteneurisé distinct** en région UE pour la veille,
  la génération et la soumission. Voir **ADR-0001**. L'architecture du moteur de veille est fixée par
  **ADR-0002**.
- **Budget / calendrier :** à définir (voir Questions ouvertes).
- **Marché / langue / conformité :** **international dès le MVP — tous pays, tous secteurs.** Un
  utilisateur doit pouvoir postuler partout dans le monde, et un profil non technique doit trouver
  des offres qui lui correspondent. Interface en **français par défaut et en anglais** ; les documents
  générés sont rédigés dans **la langue de l'offre**, et mis au **format attendu par le marché visé**
  (les conventions de CV diffèrent nettement d'un pays à l'autre). Données hébergées en UE, RGPD
  appliqué à tous les utilisateurs comme socle unique — c'est le régime le plus exigeant, donc le plus
  simple à tenir globalement.
- **Équipe :** agents Claude Code pilotés par 2iD, sous le cadre Vantry — donc des issues atomiques,
  une porte de vérification à chaque changement, et une revue de sécurité obligatoire sur tout ce qui
  touche l'authentification, les données personnelles ou l'envoi sortant.

## Obligations

Ce que ce produit est **contraint** de faire — à cause de ce qu'il fait réellement.

> **Chaque ligne est une hypothèse à faire confirmer par un professionnel. Ceci n'est pas un avis
> juridique.** Les obligations **non techniques** — contrat de sous-traitance par sous-traitant,
> politique de confidentialité, registre des traitements, désignation éventuelle d'un DPO — ne sont
> pas dans ce tableau et ne sont pas le travail de l'agent.

| # | Déclencheur dans CE produit | Contrôle technique | Où ça atterrit |
|---|---|---|---|
| OBL-1 | On stocke des CV, parcours, salaires et candidatures de personnes en UE — des données personnelles, dont certaines révèlent une situation professionnelle sensible | Cloisonnement par utilisateur au niveau de la base (RLS) avec tests d'autorisation **et de refus** ; chiffrement au repos ; export et **suppression dure** en libre-service | REQ-014 · epic Conformité |
| OBL-2 | Le produit **agit auprès de tiers au nom de l'utilisateur** (soumission, envoi) | Mandat explicite et horodaté à l'activation de chaque canal ; journal d'audit non modifiable ; révocation en un geste effective sur les travaux déjà en file | REQ-009, REQ-012, REQ-013 |
| OBL-3 | On traite des données de **recruteurs qui ne sont pas nos utilisateurs** (nom, poste, email professionnel) | Finalité limitée à la mise en relation ; information et droit d'opposition ; pas d'envoi en masse ; suppression sur demande | epic Contact recruteur *(assumé — confirmer)* |
| OBL-4 | Un **contenu généré par IA** part sous l'identité de l'utilisateur | Aperçu intégral avant le premier envoi de chaque canal ; contenu exact conservé dans le reçu ; édition toujours possible | REQ-010, REQ-013 |
| OBL-5 | On lit la boîte mail de l'utilisateur pour détecter les réponses | OAuth avec les **portées minimales** (lecture restreinte), consentement explicite, jamais de lecture hors des fils liés à une candidature, vérification Google requise avant mise en production | REQ-015 *(assumé — confirmer)* |
| OBL-6 | Le contenu d'une offre est du **texte non fiable injecté dans un LLM** qui rédige ensuite des emails et remplit des formulaires | Frontière de confiance explicite : le contenu d'offre n'est jamais traité comme instruction ; sorties contraintes par schéma ; aucune action sortante déclenchable par le contenu d'une offre | REQ-011 · threat-model |
| OBL-7 | Abonnement payant | Stripe hébergé — aucune donnée de carte ne transite par nos serveurs (SAQ-A) | epic Facturation |
| OBL-8 | Les plateformes tierces ont des CGU | Politique produit écrite : canaux automatiques limités aux sources dont les conditions le permettent ; tout le reste en mode assisté | Hors périmètre, ci-dessus |

## Économie unitaire

> Arithmétique sur des hypothèses **explicitement marquées**. Aucun prix n'a été relevé sur le web.
> **Rien ici n'est valide tant que 2iD n'a pas fourni ses propres chiffres.**

| Ligne | Par utilisateur / mois |
|---|---|
| Prix | $\<à fournir\> |
| Jetons LLM — boucle centrale, \<N\> candidatures × (scoring + CV + lettre) | −$\<à calculer une fois N et le palier fixés\> |
| Frais de paiement | −$\<selon le contrat Stripe de 2iD\> |
| SaaS à la place (base, mail sortant, navigateur piloté) | −$\<à fournir\> |
| Infra, amortie par utilisateur | −$\<à fournir\> |

**Le levier à surveiller :** le coût est proportionnel au **nombre de candidatures**, pas au nombre
d'utilisateurs. Un utilisateur en autonomie haute peut coûter dix fois un utilisateur prudent. Le
quota quotidien de REQ-009 n'est donc pas seulement une garantie de confiance, c'est **le régulateur
de la marge** — et c'est la raison pour laquelle il est dans le MVP et non en v2.

## Métrique de succès

**À la semaine 8, 50 utilisateurs ont complété la boucle centrale deux fois dans la même semaine**
— c'est-à-dire deux candidatures approuvées ou envoyées automatiquement, dont le reçu a été consulté.
Aujourd'hui : 0. Le nombre d'inscrits et le nombre d'offres détectées ne comptent pas.

## Hypothèses les plus risquées

Ordonnées : la première tue le projet si elle est fausse.

1. **On peut soumettre une candidature de façon fiable sur le formulaire public d'un ATS.** Les API
   publiques des boards ATS sont en **lecture seule** — elles listent les offres, elles ne les
   reçoivent pas ; la soumission passe par la page de candidature publique, donc par un navigateur
   piloté, avec anti-robots, champs personnalisés par employeur et pages qui changent sans préavis.
   → **Test, avant tout autre développement :** une pointe technique d'une semaine qui tente 20
   soumissions réelles réparties sur les 5 fournisseurs, et mesure le taux de réussite et le taux
   d'escalade. **Sous 70 % de réussite, le produit se recentre sur « préparer en 10 secondes, envoyer
   en 1 clic »** — ce qui reste une bonne proposition de valeur, mais un autre produit. Cette pointe
   est l'issue n°1 du sprint 1.
2. **La vitesse produit réellement plus d'entretiens.** C'est la promesse. → Test : mesurer le taux
   de réponse en fonction du délai entre publication et candidature sur les 500 premières
   candidatures. Si la corrélation est plate, l'argument de vente change.
3. **Les utilisateurs acceptent de déléguer l'envoi.** → Test : mesurer, sur la cohorte pilote, la
   part qui passe du cran « proposer » au cran « agir seul » sous 14 jours.
4. **Le coût LLM par candidature reste sous le seuil de marge.** → Test : instrumenter le coût réel
   par candidature dès la première ligne de code du worker, pas après.
5. **La couverture est réelle hors de la tech anglophone.** C'est le risque n°1 de la décision
   « international, tous secteurs ». L'écosystème ATS couvre très bien la tech et les scale-ups, très
   mal les PME, le secteur public et les métiers non tertiaires — c'est le palier B d'ADR-0002 qui
   doit rattraper, et sa fraîcheur est moindre.
   → **Test, sprint 2 :** sur cinq profils réels et volontairement contrastés (développeuse à Paris,
   commercial à Dakar, comptable à Lyon, infirmier au Québec, chef de projet à Casablanca), compter
   sur 7 jours les offres pertinentes détectées et **la part venue du palier A**. Un profil dont
   moins de 10 % des offres viennent du palier A ne bénéficie pas de la promesse de vitesse : il faut
   soit le dire honnêtement dans le produit, soit ne pas vendre ce segment.

## Questions ouvertes

Chacune avec une valeur par défaut recommandée, pour que rien ne soit bloqué.

| Question | Défaut recommandé | À trancher avant |
|---|---|---|
| Le nom du produit — « job » est générique et non protégeable | Lancer `/originality-check` sur 3 candidats avant de figer quoi que ce soit dans le code et les docs | Sprint 1 |
| Le worker doit-il embarquer le moteur Python `last30days` ou seulement réimplémenter `jobs.py` ? | Réimplémenter les connecteurs ATS en TypeScript (c'est ~700 lignes bien documentées, MIT) et appeler `last30days` **uniquement** pour l'intelligence entreprise et le brief d'entretien, via son export JSON versionné | ADR-0002, sprint 1 |
| Modèle tarifaire | Abonnement mensuel avec quota de candidatures par palier — aligne le prix sur le coût réel | Sprint 3 |
| Portée de la lecture d'emails | OAuth Gmail en lecture restreinte au MVP ; Outlook en v2 | Sprint 4 |
| Ordre d'ouverture des marchés au palier B | Commencer par les connecteurs multi-pays et tous secteurs (couverture large immédiate), puis ajouter les portails nationaux là où les utilisateurs sont | Sprint 2 |
| Résidence des données pour les utilisateurs hors UE | UE unique au MVP ; une seconde région sera une décision commerciale, pas technique | Post-lancement |
| Clés d'API tierces (agrégateurs, vérification d'email, navigateur piloté) | Démarrer sur les sources gratuites et sans clé, n'ajouter une source payante que si le test n°5 montre un trou de couverture | Sprint 2 |
