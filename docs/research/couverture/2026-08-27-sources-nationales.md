# Ce qui comble la lacune, et ce qui ne la comble pas

- **Mesuré le :** 2026-08-27 · **Issue :** JOB-089 · **Satisfait :** REQ-003
- **Antécédents :** `2026-08-26-cinq-profils.md` (la lacune) · `2026-08-27-decouverte-employeurs.md`
  (la première voie essayée)

> **Le constat :** un **portail public national** fait ce qu'aucune autre source n'a su faire —
> 2 028 postes d'infirmier, 963 d'enseignant, 79 de comptable, **sur place**, avec leur date limite.
> Aucun agrégateur généraliste sans clé n'y parvient, et ce n'est pas faute d'avoir cherché.

---

## 1. Ce qui a été essayé

Sept sources sondées le 2026-08-27, sans clé :

| source | réponse | verdict |
|---|---|---|
| **JobTech Dev** (service public suédois) | 200 | **retenue** — API ouverte, complète, datée |
| **The Muse** | 200 | **retenue avec réserve** — voir § 3 |
| ReliefWeb | 403 | demande un `appname` approuvé (démarche gratuite, humaine) |
| USAJOBS | 401 | demande une clé |
| Adzuna | 400 | demande `app_id` + `app_key` |
| France Travail | 401 | demande `client_id` + `client_secret` |
| Bundesagentur für Arbeit (DE) | 403 | demande une clé |

---

## 2. JobTech Suède — la preuve que le modèle marche

| requête | offres | exemple |
|---|---|---|
| `sjuksköterska` (infirmier) | **2 028** | Sjuksköterska — Bengtsfors, Västra Götalands län |
| `lärare` (enseignant) | **963** | Lärare — Värmdö, Stockholms län |
| `ekonom` (comptable) | **79** | Ekonom — Säffle, Värmlands län |
| `utvecklare` (développeur) | 642 | — |

Ce sont exactement les trois métiers que `JOB-076` laissait à zéro, dans un pays donné, **sur place**.
Un portail public national y parvient parce que c'est ce qu'il est fait pour faire.

### Ce qu'il apporte et que nulle autre source n'avait

**`application_deadline`.** Aucune source précédente ne dit quand une offre cesse d'être candidatable.
C'est précisément ce dont `JOB-048` a besoin pour **archiver** un élément de file au lieu de l'envoyer
après coup — et jusqu'ici cette échéance était toujours nulle, donc la règle ne s'appliquait jamais.

Une source qui fournit sa date limite rend une garantie du produit **opérante**, pas seulement écrite.

---

## 3. The Muse — un gain réel, et un piège

Elle rend du non-tech en volume : **21 480** offres en catégorie *Healthcare*, plus *Management*,
*Sales*, *Administration*. Sur un marché nord-américain, c'est un gain net.

**Mais son filtre de lieu est silencieusement permissif.** Interrogée sur « Dakar, Senegal », elle
annonce 6 340 offres et en rend 33 dont **zéro** ne concerne le Sénégal :

| lieu demandé | concordent | distanciels | total rendu |
|---|---|---|---|
| Dakar | **0** | 20 | 33 |
| Lyon | **0** | 20 | 33 |
| Bogotá | 1 | 19 | 31 |
| Paris | 6 | 14 | 33 |
| Bangalore | 12 | 8 | 28 |

Le filtre n'échoue pas : **il est ignoré, et la réponse a l'air normale.** Reprendre son `page_count`
pour annoncer « 6 340 offres à Dakar » serait un mensonge du genre qu'on ne découvre qu'en ouvrant la
troisième offre.

Le connecteur envoie donc l'indice de lieu — il aide réellement là où la source connaît la ville — puis
**filtre chez nous, sur le lieu réellement rendu**, et ne compte que ce qui a passé ce filtre. C'est la
même distinction que `JOB-090` : ce que la source **déclare** n'est pas ce qu'elle **sert**.

### Et elle ne comble pas la lacune

Mesuré sur cinq pages par profil, avec filtrage honnête :

| profil | sur place | rendues |
|---|---|---|
| infirmier · Nantes | **0** | 21 |
| comptable · Lyon | **0** | 86 |
| enseignant · Bogotá | **0** | 46 |
| marketing · Dakar | **0** | 0 |
| backend · Toronto | 12 | 100 |

**Deuxième source mesurée, même échec pour les mêmes trois profils.** Le motif est net : toute source
généraliste anglophone sans clé est centrée sur l'Amérique du Nord.

---

## 4. Ce que ça demande

La lacune **ne se comble pas sans clés**. Chaque portail national qui couvrirait un marché est derrière
une inscription — gratuite, mais humaine.

| portail | couvre | ce qu'il faut | ce qu'il ouvre |
|---|---|---|---|
| **France Travail** | France, tous secteurs | inscription sur `francetravail.io`, `client_id` + `client_secret` | **l'infirmier de Nantes et le comptable de Lyon**, mesurés à zéro deux fois |
| **Adzuna** | FR, DE, BR, IN, ZA, AU… | `app_id` + `app_key` gratuits | plusieurs marchés d'un coup, dont le Brésil et l'Inde |
| **Bundesagentur für Arbeit** | Allemagne | clé | le marché allemand, absent aujourd'hui |
| **USAJOBS** | fonction publique américaine | clé | un secteur public entier |
| **ReliefWeb** | humanitaire, Afrique et Asie | `appname` approuvé par courriel | **Dakar et Bogotá**, les deux marchés les plus mal couverts |

`JOB-093` porte ces inscriptions. Chacune est un formulaire de quelques minutes, et **chacune ouvre un
marché que le produit annonce aujourd'hui ne pas couvrir**.

---

## 5. Ce que cette mesure ne dit pas

- **JobTech couvre la Suède**, pas l'Europe. Le modèle est prouvé, la couverture non.
- Les volumes annoncés par une API ne sont pas des offres **pertinentes** — c'est la leçon de The Muse,
  et elle vaut aussi pour JobTech tant qu'on n'a pas croisé ses offres avec de vrais profils.
- Aucune de ces sources n'a été mesurée **dans la durée**. Une API qui répond aujourd'hui peut fermer,
  et c'est pour ça que `couvertureAffirmable()` existe.
