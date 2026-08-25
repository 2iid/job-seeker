# Correspondance — user stories de design → backlog

Les 16 stories de l'artboard `docs/design/job-seeker/project/User stories.dc.html` ne créent pas
d'issues parallèles : elles **enrichissent les critères d'acceptation** des issues existantes.
Les critères globaux **G1–G6** sont un contrat transversal (voir `design-system.md` §6) — ils ne se
répètent pas ticket par ticket, et un ticket qui les viole est rejeté.

| Story | Ce qu'elle exige | Issue(s) | REQ |
|---|---|---|---|
| **US-01** | Arrêt en un geste depuis tout écran · ≤ 2 Tab · `Maj + .` · aucune modale | JOB-053, JOB-013 | REQ-012 |
| **US-02** | Cran d'autonomie changeable sans quitter l'écran · groupe radio flèches + Espace · cran verrouillé focalisable avec motif | JOB-046 | REQ-009 |
| **US-03** | Compte rendu lisible en 5 s · ≤ 12 actions puis regroupement · nuit calme formulée positivement | JOB-063, JOB-016 | REQ-013 |
| **US-04** | Reçu exact · annulation bornée à 10 s et arrêtable · retour de focus testé à la fermeture | JOB-055, JOB-056 | REQ-013 |
| **US-05** | Approbation en ≤ 10 s à une main — **mesuré**, médiane sur 3 éléments, échec = story non livrée | JOB-048, JOB-015 | REQ-010 |
| **US-06** | Motif de refus qui entraîne l'agent | JOB-048 (capture), JOB-077 (apprentissage, v1.1) | REQ-010, ex-REQ-006 |
| **US-07** | Score déplié en preuves citant l'offre · 5 crans, jamais un dégradé | JOB-014, JOB-039 | REQ-005 |
| **US-08** | Palier affiché partout où l'âge l'est · aucun rang chiffré inventé | JOB-017, JOB-038 | REQ-004 |
| **US-09** | Escalade explicite quand un formulaire bloque · aucun contournement | JOB-050 | REQ-011 |
| **US-10** | Lisible à 214 candidatures · zone « aujourd'hui » séparée de l'archive | JOB-060, JOB-063 | REQ-015 |
| **US-11** | Devise de l'offre + conversion identifiée comme telle | JOB-020, JOB-038 | REQ-003, REQ-004 |
| **US-12** | Masquage des employeurs en un geste · notifications comprises | JOB-080 *(promue en S6)* | REQ-015 |
| **US-13** | Confirmation de l'extraction du CV avant tout usage | JOB-032 | REQ-001 |
| **US-14** | Différence modification par modification, refus individuel | JOB-041 | REQ-007 |
| **US-15** | Première offre trouvée **en direct** pendant l'entrée | **JOB-081** *(créée depuis le design)* | REQ-001, REQ-002 |
| **US-16** | Le message au recruteur reste dans la main de l'utilisateur | JOB-067 | REQ-016 |

## Ce que le design a ajouté au backlog

- **JOB-081 — Parcours d'entrée** : l'artboard `Parcours` conçoit entièrement une étape que le
  backlog ne couvrait pas. Le produit se prouve par une offre trouvée en direct, pas par un bouton
  « Terminer ».
- **JOB-082 — Palier C** : le système définit `--palier-c` comme un statut à part entière
  (« je vous assiste, je ne postule pas »). Le moteur de veille n'avait aucune issue pour le
  matérialiser.

## Décisions prises

**US-12 — mode discrétion : promue.** `JOB-080` passe du Backlog v1.1 au **sprint 6**, en P1, taille M.
Le design en fait une story de la persona P2, *le veilleur en poste* — les gens qui cherchent en
ayant déjà un emploi, c'est-à-dire ceux qui ont le plus à perdre. La décomposition a ajouté un
critère que le design impliquait sans l'écrire : **les notifications hors application doivent elles
aussi être muettes sur l'employeur**. Une notification d'écran verrouillé qui annonce le nom d'une
entreprise annule la fonctionnalité entière, quel que soit le soin porté aux écrans.
