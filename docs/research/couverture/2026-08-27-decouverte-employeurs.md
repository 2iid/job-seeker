# Découvrir des employeurs ne suffit pas à trouver des offres

- **Mesuré le :** 2026-08-27 · **Issue :** JOB-088 · **Satisfait :** REQ-003
- **Rejouer :** `apps/worker/src/sources/decouverte/` + le script de mesure du dépôt

> **Le constat :** le mécanisme fonctionne — Wikidata rend des employeurs par secteur et par pays, et
> la sonde les classe. Mais **17 employeurs sur 20 ne publient rien de structuré**. La voie du palier A
> par les sites d'employeurs **ne comble pas** la lacune mesurée par `JOB-076`.

---

## 1. Ce qui a été construit

`JOB-076` avait montré que nos sources d'offres ne couvrent que le distanciel tech. Le palier A —
lire le board de l'employeur lui-même — répond en principe à ce besoin, mais suppose de **connaître
l'employeur**, et le registre était vide hors tech.

Deux pièces :

- **une source d'EMPLOYEURS** (Wikidata, licence CC0, API publique) : « les hôpitaux de France avec
  leur site officiel », « les banques de Côte d'Ivoire » ;
- **une sonde** qui visite le site, essaie les chemins de carrières courants, **suit le lien de
  recrutement** même vers un autre domaine, et classe : `lisible` / `assiste` / `plateforme-inconnue`
  / `rien`.

---

## 2. Les résultats

Quatre lots, 20 employeurs sondés.

| lot | employeurs | lisible | assisté | plateforme inconnue | rien |
|---|---|---|---|---|---|
| santé · France | 5 | 0 | 1 | 0 | 4 |
| éducation · France | 5 | 0 | 0 | 0 | 5 |
| finance · France | 5 | 0 | 0 | **1** (`myworkdayjobs.com`) | 4 |
| santé · Sénégal | 5 | 0 | 1 | 0 | 4 |
| **total** | **20** | **0** | **2** | **1** | **17** |

**Zéro board lisible.** Aucun des vingt employeurs n'utilise l'une des cinq plateformes ATS que nous
savons lire, ni ne pose de `JobPosting` sur son site.

---

## 3. Ce que ça veut dire

### a. Le mécanisme marche, la voie ne mène pas là

La sonde a correctement identifié deux sites protégés par un dispositif anti-robot — donc **palier C**,
et le produit doit le dire plutôt qu'insister — et une plateforme que nous ne savons pas lire. Elle
n'a rien manqué : il n'y avait rien à trouver.

Un hôpital public français ne publie pas ses postes en `JobPosting`. Il les publie sur un portail
national, dans un PDF, ou sur une plateforme sectorielle.

### b. La sonde avait un défaut, et il a été corrigé

La première version n'essayait que des chemins sur le **même domaine**. Elle rendait « rien » pour le
CHU de Nantes, dont le site de recrutement est `rejoignez-le-chu-de-nantes.fr` — un domaine à part,
atteignable seulement par un lien de la page d'accueil. Et c'est précisément là que se trouvait
**`mstaff.co`**, un ATS sectoriel santé français.

Une sonde qui ne suit pas le lien mesure la structure des URL, pas la présence d'offres.

*(Le CHU de Nantes ne figure pas dans l'échantillon Wikidata tiré ci-dessus : la découverte est
incomplète, ce qui est assumé — on cherche à amorcer un registre, pas à le compléter.)*

### c. Une mesure a failli confirmer son propre défaut

La requête SPARQL employait `wdt:P31/wdt:P279*` — la traversée des sous-classes. Sur la France, elle
**dépassait le délai du service** : deux refus de suite. Or un délai dépassé se présentait chez nous
comme « aucun employeur trouvé » — c'est-à-dire **exactement comme la lacune qu'on cherchait à
mesurer**. La mesure aurait confirmé ce qu'elle était censée éprouver.

---

## 4. Ce que ça change pour la suite

`JOB-089` — les sources nationales et sectorielles — n'est plus une piste parmi d'autres. **C'est la
seule qui puisse combler la lacune** pour un infirmier à Nantes, un comptable à Lyon ou un enseignant
à Bogotá.

| # | conséquence | issue |
|---|---|---|
| 1 | **Prioriser `JOB-089`** au-dessus de l'élargissement du palier A. Les portails nationaux (France Travail et équivalents) sont la voie, pas les sites d'employeurs. | `JOB-089` |
| 2 | Le **plan de travail** produit par la sonde reste la bonne façon de choisir un connecteur ATS à écrire : « écris `mstaff`, il ouvre N hôpitaux » vaut mieux que « il faudrait plus de sources ». Mais il faut un échantillon plus large pour que le classement veuille dire quelque chose. | `JOB-092` |
| 3 | Les employeurs protégés par un anti-robot sont des **palier C** : le registre doit les enregistrer comme tels plutôt que de les re-sonder chaque semaine. | `JOB-092` |

---

## 5. Ce que cette mesure ne dit pas

- **Vingt employeurs, quatre lots.** L'ordre de grandeur est net — zéro sur vingt — mais le classement
  des plateformes ne veut rien dire à cette échelle.
- L'échantillon Wikidata n'est **pas représentatif** : il rend ce qui est décrit dans Wikidata, ce qui
  favorise les institutions notables sur les employeurs ordinaires.
- Elle ne dit rien des **grandes entreprises privées**, qui utilisent probablement davantage
  d'ATS connus. Le seul employeur privé du lot — Europcar — était justement le seul à en avoir un.
