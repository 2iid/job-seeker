# D'où viennent ces fixtures

**Elles ne sont pas relevées.** Les fixtures ATS (`../ats/fixtures/`) et agrégateurs
(`../agregateurs/fixtures/`) sont des réponses réelles enregistrées ; celles-ci sont **écrites depuis
la spécification schema.org**, et la différence est dite ici plutôt que supposée.

Trois tableaux publics ont été relevés le 2026-08-26 — `boards.greenhouse.io`, `jobs.lever.co`,
`jobs.ashbyhq.com` — et aucun ne pose de `JobPosting` dans le HTML servi : ces pages sont rendues par
script, et la donnée structurée n'apparaît qu'après exécution. Ce qui ressemblait à un `JobPosting`
sur Ashby était un **nom d'indicateur de fonctionnalité**, pas de la donnée structurée.

## Pourquoi c'est acceptable ici, et pas ailleurs

Un connecteur ATS lit une API dont **la seule documentation fiable est ce qu'elle renvoie**. Un
parseur éprouvé contre ses propres suppositions n'y prouve rien.

Pour JSON-LD, la spécification **est** le contrat, et le risque n'est pas de deviner un nom de champ :
c'est que la même information arrive sous une forme différente. La spécification autorise, pour une
même donnée, un objet, un tableau, un `@graph`, un `@type` en tableau, un `@value` imbriqué. Un
lecteur qui n'en gère qu'une lit correctement les pages d'un générateur de site et rate celles de tous
les autres — **sans jamais échouer**, ce qui est le pire cas : la source paraît simplement vide.

Ces fixtures énumèrent donc cette matrice à dessein.

| fichier | ce qu'il éprouve |
|---|---|
| `page-simple.html` | un `JobPosting` seul, la forme la plus fréquente |
| `page-graphe.html` | `@graph`, `@type` en tableau, salaire en plage, `TELECOMMUTE` |
| `page-liste.html` | plusieurs offres, une expirée, une sans URL, du HTML dans la description |
| `page-hostile.html` | un bloc illisible, un `__proto__`, un `@graph` imbriqué |

Le **bloc démesuré** n'est pas dans un fichier : le test le construit. Six cents kilo-octets de `x`
seraient six cents kilo-octets à cloner, pour tout le monde, à chaque fois — pour éprouver une borne
qui tient en une ligne.

## Ce qui reste à faire

`JOB-085` : rejouer ce lecteur contre **vingt pages carrières réelles** posant du `JobPosting`, une
fois qu'un rendu de page est disponible. Tant que ce n'est pas fait, la couverture annoncée par ce
connecteur est une couverture **attendue**, pas une couverture **constatée**.
