# Ce que le moteur couvre vraiment — cinq profils contrastés

- **Mesuré le :** 2026-08-26 · **Issue :** JOB-076 · **Satisfait :** REQ-003
- **Périmètre :** les trois connecteurs de **palier B** (Arbeitnow, Remotive, Jobicy), en conditions
  réelles, contre les API publiques.
- **Reproduire :** `docs/research/couverture/mesurer.ts`

> **Le constat, en une phrase :** la couche agrégateurs couvre le **travail distanciel de la tech**
> et à peu près rien d'autre. Trois profils sur cinq obtiennent **zéro** offre pertinente.

---

## 1. Les cinq profils, et pourquoi ceux-là

Le brief vise **tous les pays et tous les secteurs**. Choisir cinq entreprises de logiciel pour
mesurer la couverture d'un tel produit reviendrait à mesurer ce qu'on sait déjà faire. Quatre des
cinq profils sont donc délibérément **hors tech**, et trois **hors Europe de l'Ouest**.

| profil | secteur | marché | mode |
|---|---|---|---|
| Cheffe de projet marketing | marketing | Dakar, Sénégal | indifférent |
| Infirmier coordinateur | santé | Nantes, France | présentiel obligatoire |
| Senior backend engineer | logiciel | Canada | distanciel |
| Comptable | finance / support | Lyon, France | hybride |
| Enseignant d'anglais | éducation | Bogotá, Colombie | présentiel |

---

## 2. Les résultats bruts

`total` = offres rendues par la source · `pertinentes` = offres dont le titre ou la description
contient un mot de la requête. Le second est une borne **haute** : il ne vérifie ni le lieu, ni le
niveau, ni la langue.

| profil | Arbeitnow | Remotive | Jobicy | **pertinentes** |
|---|---|---|---|---|
| Cheffe de projet marketing · Dakar | 40 / 175 | 1 / 18 | 50 / 200 | **91** |
| Infirmier coordinateur · Nantes | 0 / 175 | 0 / 18 | 0 / 200 | **0** |
| Senior backend engineer · Canada | 36 / 175 | 4 / 18 | 57 / 200 | **97** |
| Comptable · Lyon | 0 / 175 | 0 / 18 | 0 / 200 | **0** |
| Enseignant d'anglais · Bogotá | 0 / 175 | 1 / 18 | 0 / 200 | **1** |

Les trois sources ont répondu `ok` à chaque appel : **aucune panne n'explique ces zéros.** C'est la
couverture réelle.

### Ce que les 91 offres « marketing » sont vraiment

Elles ne sont pas à Dakar. Le mot « marketing » apparaît dans des postes de *growth*, de *product
marketing* et de *content* chez des entreprises de logiciel nord-américaines et allemandes. Pour une
cheffe de projet marketing sénégalaise cherchant sur place, la couverture réelle est **proche de
celle de l'infirmier : zéro**.

---

## 3. Où sont les offres, en fait

Sur les **393 offres** rendues par les trois sources réunies :

| lieu déclaré | offres |
|---|---|
| USA | 151 |
| Londres | 31 |
| Berlin | 25 |
| Royaume-Uni | 15 |
| Munich + München | 17 |
| Canada | 8 |
| Allemagne (autres) | ~20 |
| Mexique | 6 |
| reste | le solde |

**61 % sont explicitement distancielles.** Aucune offre en Afrique, aucune en Amérique du Sud hors
Mexique, aucune en Asie du Sud ou du Sud-Est.

**Recouvrement entre les trois sources : 0,0 %.** Les 393 offres sont 393 offres distinctes. C'est
une bonne nouvelle — les sources se complètent au lieu de se répéter — et cela veut aussi dire que
chaque source ajoutée apporte réellement, ce qui rend l'ajout de sources la piste la plus rentable.

---

## 4. Trois choses que cette mesure a apprises, et qui ne se voyaient pas

### a. Les connecteurs de palier B ignorent la requête

Les totaux sont **identiques pour les cinq profils** : 175, 18, 200. Les trois API rendent leur flux
entier ; aucune ne filtre côté serveur. Le filtrage se fait donc entièrement chez nous, sur des
offres déjà rapatriées.

Ce n'est pas un défaut en soi — c'est même ce qui rend le dédoublonnage possible — mais cela change
deux choses. D'abord la cadence : rapatrier 393 offres pour en garder zéro, cinq fois par jour, pour
un infirmier, est un coût pur. Ensuite l'affichage : dire « je surveille trois sources » à cet
infirmier est vrai et trompeur à la fois.

### b. « Zéro offre pertinente » n'est pas « aucune offre »

Les trois sources ont répondu `ok`. Le moteur a donc le droit de dire « rien pour vous
aujourd'hui » — et ce serait faux dans l'esprit sinon dans la lettre : il n'y a rien **là où je
regarde**, ce qui n'est pas la même chose. `couvertureAffirmable()` répond juste sur l'état
technique et ne sait rien de l'adéquation d'une source à un profil.

### c. Le palier A est la seule réponse pour quatre profils sur cinq

Une infirmière à Nantes se recrute sur le site du CHU, pas sur un agrégateur d'offres distancielles.
Un comptable à Lyon, sur le site du cabinet. C'est exactement ce que le palier A sert — mais il
suppose de **connaître l'employeur d'abord**, et le registre est vide pour ces secteurs.

---

## 5. Ce que cela impose au produit

| # | conséquence | issue |
|---|---|---|
| 1 | Le produit ne doit **pas** annoncer une couverture mondiale tous secteurs tant que la mesure ci-dessus tient. Ce qu'on couvre aujourd'hui : le distanciel tech anglophone. | `JOB-087` |
| 2 | La découverte d'employeurs par **secteur et par pays** est la seule voie vers les quatre profils non couverts. Sans elle, le palier A reste théorique hors tech. | `JOB-088` |
| 3 | Il faut des sources **nationales et sectorielles** : France Travail, portails de santé, jobboards régionaux africains et latino-américains. | `JOB-089` |
| 4 | L'écran doit dire **où** il a regardé, pas seulement qu'il a regardé. « Rien pour vous » sans « je n'ai que des sources distancielles anglophones pour l'instant » est un mensonge par omission. | `JOB-090` |

---

## 6. Ce que cette mesure ne dit pas

- Elle ne mesure **que le palier B**. Le palier A dépend du registre d'employeurs, qui est vide pour
  ces secteurs — c'est le constat n° 2, pas une lacune de la mesure.
- Le compte `pertinentes` est une correspondance de mots-clés, donc une **borne haute**. Le vrai
  taux, après vérification du lieu, du niveau et de la langue, est plus bas — pour le profil
  marketing, il est probablement nul.
- Une seule journée. La composition d'un flux d'agrégateur varie ; l'ordre de grandeur, non.
