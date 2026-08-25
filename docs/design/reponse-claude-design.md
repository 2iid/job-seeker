# Réponse à coller dans Claude Design

---

Oui, pars sur **1b — La Cabine**, avec exactement la greffe que tu proposes : l'ossature de 1b, et la voix de 1c dans les zones de décision. L'agent parle en phrases là où je décide (file d'approbation, explication du score, escalades), et en relevé là où je suis (suivi, reçus, journal). 1a et 1c sont écartées — garde-les visibles pour mémoire, ne les fais pas évoluer.

Enchaîne sur la suite du §11. Trois choses avant que tu reprennes.

## 1. Le mode clair est un livrable, pas une variante

C'est ma seule vraie exigence supplémentaire, et elle n'est pas négociable : **le clair doit être conçu, pas dérivé.** 1b est sombre d'origine parce que l'agent travaille la nuit — mais la moitié de mes utilisateurs consulteront ce produit en plein jour, dans un open space, sur un écran mal calibré. Un clair bâclé disqualifie la direction.

Concrètement :

- **Chaque token porte une valeur dans les deux thèmes.** Aucun rôle ne peut être défini uniquement en sombre. Si un token n'existe que d'un côté, c'est un défaut de système.
- **Les accents ne peuvent pas garder leur clarté.** En sombre ils vivent autour de L 0.76 sur un fond L 0.19. Sur blanc, à cette clarté, ils sont illisibles. Descends-les — vise L 0.47 environ — en **conservant les teintes** : le bleu reste « ce que la machine a fait », l'ambre reste « ce qui attend un humain ». Le code de lecture doit être identique dans les deux thèmes, seule la clarté bouge.
- **Les contrastes sont mesurés et écrits**, pas estimés : 4,5:1 pour le corps, 3:1 pour le grand texte et les parties non textuelles des contrôles, **dans les deux thèmes**, avec la valeur inscrite à côté de chaque token.
- **Livre au minimum deux écrans entiers en clair** — le poste de commande et la file d'approbation — pour prouver la parité sur le plus dense et sur le plus tactile. Mêmes structures, mêmes hiérarchies, mêmes cibles de 44 px : seuls les rôles de couleur changent.
- La règle « jamais de statut porté par la couleur seule » vaut dans les deux thèmes, et se vérifie en niveaux de gris.
- Les surfaces claires ne sont pas du blanc pur partout : garde la logique de modules jointifs, avec une page légèrement teintée et des modules blancs, pour que le trait de 1 px continue de structurer.

## 2. Des décisions produit ont été prises depuis le Tour 1

Elles changent des écrans. Intègre-les.

**Le marché est international, tous secteurs.** Pas seulement la tech, pas seulement la France. Un comptable à Dakar, un infirmier au Québec et une développeuse à Paris doivent tous trouver leur compte. Conséquences visuelles : les salaires s'affichent dans la devise de l'offre **et** convertis, la conversion étant identifiée comme telle ; les heures sont dans le fuseau du candidat ; l'interface est en français par défaut et en anglais, mais **les documents générés sont rédigés dans la langue de l'offre** ; et le CV est mis au **format attendu par le marché visé** — les conventions diffèrent nettement d'un pays à l'autre (photo, date de naissance, nationalité, longueur admise), et le produit doit dire ce qu'il omet et pourquoi.

**La veille a trois paliers, et l'interface ne doit pas mentir dessus.** Palier A : les boards d'entreprises surveillés toutes les 2 à 5 minutes — c'est là, et seulement là, que « parmi les premiers » est vrai. Palier B : les agrégateurs et portails publics, 15 à 60 minutes, qui portent la couverture mondiale et tous secteurs. Palier C : les plateformes où l'on ne peut qu'assister l'utilisateur. **Une offre de palier B ne doit jamais emprunter l'apparence de fraîcheur d'un palier A.** C'est la seule promesse défendable du produit ; la surestimer la détruit. Ton indicateur de fraîcheur doit donc afficher le palier partout où il affiche l'âge.

**Postuler passe par le formulaire public de l'employeur, piloté par un navigateur.** Ce n'est pas un appel d'API propre : il y a des champs inconnus, des questions variables, parfois un anti-robot. Il faut donc concevoir **l'état d'escalade** comme un état de première classe : l'agent s'arrête, explique ce qui l'a bloqué, et rend la main. Et une règle affichée dans le produit : aucun anti-robot n'est jamais contourné.

**Le contact recruteur est au produit, mais en mode assisté.** L'agent identifie la personne et rédige l'email ; l'utilisateur l'envoie depuis sa propre boîte après relecture. Il n'y a pas d'envoi autonome, pas de relance automatique, pas d'envoi groupé. Les contacts s'affichent **avec leur niveau de certitude** : une adresse devinée est présentée comme devinée, jamais comme un fait. Le design doit rendre impossible que cet écran ressemble à un outil de prospection de masse.

## 3. Ce qu'il reste à livrer

Dans cet ordre.

1. **Le système**, en clair et en sombre : tokens sémantiques nommés par rôle, échelle typographique avec un cas d'usage par palier et le comportement des chiffres tabulaires, grille, rayons, espacements, et les quatre états génériques — chargement, vide, erreur, trop de données. L'état vide porte une action, c'est l'écran qu'un nouvel utilisateur voit en premier.

2. **Les écrans de priorité 1, en 1280 et en 390** : poste de commande, flux d'opportunités, détail d'une offre, file d'approbation, suivi des candidatures. Avec leurs états, pas seulement le cas heureux. Deux tests de vérité : le suivi doit rester lisible à 200 candidatures, et la file d'approbation doit se traiter à une main, à 390 px, en moins de dix secondes par élément.

3. **Les écrans de priorité 2 et 3**, au moins en 1280 : console de l'agent, studio CV avec la vue de différence, bibliothèque de réponses aux questions de screening, contacts recruteurs, analyse, préparation d'entretien, réglages, et le parcours d'entrée.

   Pour la console de l'agent, une contrainte précise : **pense en phrases éditables, pas en formulaire.** « Je postule au maximum 12 fois par jour, entre 8 h et 22 h, heure de Paris » où chaque valeur soulignée s'édite sur place, plutôt que quarante champs empilés.

4. **Les cinq composants signature**, spécifiés : anatomie, variantes, états, comportement responsive, comportement clavier. L'indicateur de score dépliable, la ligne de vie de l'agent, la carte d'approbation, le reçu de candidature, l'indicateur de fraîcheur.

5. **Deux parcours bout en bout en 390** : première utilisation jusqu'à la première candidature — et fais de l'agent trouvant une offre **en direct** le point culminant, pas la fin d'un formulaire ; puis notification → approbation → reçu.

6. **Les user stories de design**, au format « En tant que \<persona\>, je veux \<capacité\>, afin de \<bénéfice\> », chacune avec des critères d'acceptation **vérifiables** — états couverts, contraste mesuré, cible tactile, comportement clavier, chaîne française la plus longue à 390 px. Elles seront importées telles quelles dans un backlog d'ingénierie : écris-les pour être lues par un développeur.

## Les critères qui feront échouer la revue

Tu les connais déjà, je les rappelle parce qu'ils seront audités ligne par ligne :

Un score affiché sans explication atteignable. Un statut porté par la couleur seule. Un anneau de focus supprimé. Une cible tactile sous 44 px. Un état vide sans action. Un compte à rebours ou un rouge permanent sur la fraîcheur. Un rang inventé — on n'écrit jamais « vous seriez le 3ᵉ candidat », nous ne le savons pas. Une troncature en français à 390 px. Un contraste estimé plutôt que mesuré. Et toute la liste d'interdits esthétiques du brief initial : crème + serif + terracotta, dégradé violet vers bleu, emojis en marqueurs de section, rayon unique appliqué partout, barre d'accent colorée sur carte arrondie.

Le critère qui prime sur tous les autres reste le même : un utilisateur anxieux doit se sentir **plus** en contrôle après avoir utilisé le produit, pas moins.

Vas-y, je te suis.
