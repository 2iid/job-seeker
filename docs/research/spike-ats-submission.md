# Soumettre une candidature automatiquement : la pointe, et sa réponse

- **Mesuré le :** 2026-08-27 · **Issue :** JOB-002 · **Hypothèse risquée n° 1 du brief**
- **Rejouer :** `node --experimental-strip-types spikes/ats-submission/mesurer.ts`
- **Portée :** la pointe va **jusqu'au bouton « Envoyer » et ne le presse pas** (décidé le 2026-08-27).

> **La réponse : non.** Sur 16 formulaires de candidature réels répartis sur quatre fournisseurs,
> **14 — soit 88 % — portent un dispositif anti-robot**. Le taux de « remplissable » est de **6 %**,
> très loin des 70 % que le brief posait comme seuil de viabilité.
>
> **Le produit doit basculer vers « préparer en 10 secondes, envoyer en 1 clic ».**

---

## 1. Ce qui a été mesuré, et ce qui ne l'a pas été

Le harnais ouvre un vrai formulaire de candidature, énumère ses champs **dans toutes les trames**,
détecte un éventuel dispositif anti-robot, et s'arrête. Il ne clique jamais, ne remplit jamais, ne
soumet jamais — et **trois tests le vérifient sur le code**, pas sur la mémoire de qui l'exécute.

Ce qui reste **non mesuré** : ce que le serveur fait d'une soumission bien formée. C'est le seul
chiffre qu'on ne peut pas obtenir sans envoyer vingt candidatures fictives à vingt recruteurs. Il est
devenu sans objet : on n'atteint pas la soumission.

---

## 2. Les résultats

| fournisseur | cibles | anti-robot | remplissable | escalade |
|---|---|---|---|---|
| Greenhouse | 4 | 2 | 1 | 1 |
| Ashby | 4 | **4** | 0 | 0 |
| Lever | 4 | **4** | 0 | 0 |
| Workable | 4 | **4** | 0 | 0 |
| SmartRecruiters | 0 | — | — | — |
| **total** | **16** | **14 (88 %)** | **1 (6 %)** | **1 (6 %)** |

Le dispositif détecté est **reCAPTCHA** dans les quatorze cas.

**SmartRecruiters n'a pas été mesuré** : dix slugs d'entreprises connues répondent `200` avec
`totalFound: 0`, et aucun board public n'a été trouvé le 2026-08-27. Un fournisseur non mesuré
apparaît ici comme non mesuré, pas comme un blanc.

Temps moyen jusqu'à l'état « prêt » : **11,3 s** — sur le seul cas qui y est parvenu.

---

## 3. Une erreur de mesure, et pourquoi elle est dite ici

La première version du harnais n'interrogeait que la page parente. Or **Greenhouse rend son
formulaire dans une iframe** (`job-boards.greenhouse.io/embed/job_app`). On mesurait donc la page
carrières de l'employeur, on y trouvait sa barre de recherche, et on concluait « un champ,
remplissable ».

Le premier relevé annonçait **75 % d'anti-robot et 19 % de remplissable**. Après correction :
**88 % et 6 %**.

L'erreur se trompait **dans la direction flatteuse** — elle rendait le produit plus viable qu'il ne
l'est. C'est la direction dans laquelle une erreur de mesure ne se remarque pas, parce qu'elle
confirme ce qu'on espérait.

---

## 4. Ce que la mesure ne prouve pas

**La présence d'un reCAPTCHA n'est pas la preuve d'un blocage.** reCAPTCHA v3 est invisible : il note
la session en arrière-plan et ne présente une épreuve que sous un certain score. Un navigateur piloté
en mode sans interface obtient un mauvais score, mais on ne l'a pas constaté — on a constaté la
**présence du mécanisme**.

Cela ne change pas la conclusion, et pour une raison qui n'est pas technique : **nous nous sommes
engagés à ne franchir aucun de ces dispositifs**, quelle que soit la facilité. Un produit qui apprend
à les contourner se ferme lui-même les portes qu'il veut ouvrir tous les jours — et cet engagement
figure déjà dans le registre du palier C.

Que le mécanisme bloque toujours ou seulement souvent, la voie automatisée nous est fermée par notre
propre règle.

---

## 5. La bascule produit

Le brief prévoyait ce cas : « un taux de réussite global sous 70 % → la conclusion énonce
explicitement la bascule vers *préparer en 10 secondes, envoyer en 1 clic*, et une décision est
demandée avant `JOB-049` ».

**Le seuil est franchi de très loin.** La promesse « l'agent postule à votre place » n'est pas
tenable sur les ATS mesurés.

### Ce qui reste, et ce qui vaut peut-être mieux

Tout ce qui a été construit jusqu'ici **garde sa valeur, et l'essentiel de sa valeur** :

- la veille à la source, avec la fraîcheur au palier près ;
- le score explicable, dont chaque preuve cite l'annonce ;
- le CV adapté qui ne peut pas inventer, et sa vue de différence ;
- la lettre dans la langue de l'offre, refusée quand la personne ne la parle pas ;
- les documents au format du marché visé, en PDF lisible par un ATS.

Ce qui change est le **dernier geste**. Au lieu de « l'agent envoie », le produit devient : *voici une
offre trouvée il y a quatre minutes, voici votre dossier prêt et relu, il vous reste un clic*.

C'est une promesse plus petite — et elle a deux propriétés que l'autre n'avait pas : **elle est
tenable**, et elle ne demande à personne de confier un envoi irréversible à une machine.

Le mandat, les quotas, l'arrêt d'urgence et les reçus (`JOB-046`, `047`, `053`, `054`) ne deviennent
pas inutiles : ils gardent le canal **e-mail** vers les recruteurs (REQ-016), qui n'a pas de
reCAPTCHA.

---

## 6. La décision demandée

`JOB-049` (soumission automatisée) et toute la chaîne qui en dépend attendent votre arbitrage :

1. **Basculer** — le dernier geste revient à la personne, sur tous les canaux ATS. Le produit tient
   sa promesse, plus petite.
2. **Basculer en gardant l'e-mail autonome** — l'agent envoie seul par courriel aux recruteurs, avec
   mandat, et prépare pour les ATS. *(recommandé : c'est ce que la mesure autorise)*
3. **Réduire encore la portée de la pointe** — mesurer les mêmes formulaires avec un navigateur non
   piloté pour savoir si le reCAPTCHA bloque réellement, avant de trancher. Cela ne change pas
   l'engagement de ne pas le franchir.
