# Système de design — La Cabine

> **Source de vérité :** les artboards livrés par Claude Design dans
> `docs/design/job-seeker/project/`. Ce fichier en est la transcription exploitable par
> l'ingénierie ; en cas de divergence, **l'artboard fait foi** et ce fichier est corrigé.
> Direction retenue : ossature **1b — La Cabine**, voix de 1c dans les zones de décision.

- **Livré le :** 2026-08-25 · **Artboards :** Système · Priorité 1 · Priorité 2-3 · Composants signature · Parcours · User stories
- **Typographie :** Epilogue (titres, corps, boutons) · IBM Plex Mono (heures, scores, montants, libellés)
- **Principe fondateur :** chaque rôle porte une valeur **dans les deux thèmes**. Aucun rôle défini
  d'un seul côté. Les contrastes ci-dessous sont **calculés** (oklch → sRGB, formule WCAG 2.1),
  jamais estimés.

---

## 1. Tokens sémantiques

Nommés par rôle. Un composant qui écrit une valeur littérale au lieu d'un token est un défaut de revue.

| Rôle | Sombre | Clair | Emploi |
|---|---|---|---|
| `--surface-page` | `#111218` | `#F1F2F7` | Le vide entre les modules. **Jamais blanc pur en clair** : le filet de 1 px doit rester visible. |
| `--surface-module` | `#1C1E25` | `#FFFFFF` | Le module. Dans les deux thèmes le contenu est plus clair que la page. |
| `--surface-chrome` | `#181920` | `#F8F9FC` | En-tête d'écran, barre d'action fixe, pied de module. |
| `--surface-sunken` | `#0B0C11` | `#E9EBF1` | Champ de saisie, squelette de chargement, zone de citation. |
| `--surface-colonne-active` | `#161720` | `#F4F5F9` | Colonne de kanban demandant une action. Teinte **en plus** du libellé et de la forme, jamais à leur place. |
| `--border-module` | `#373942` | `#D2D4DC` | Structure seule. **Sous 3:1** (1,61 / 1,48) → jamais seule frontière d'un contrôle ni seul porteur d'information. |
| `--rule-inner` | `#2A2C34` | `#E9EBF1` | Filet **intérieur** à un module. Structure seule. |
| `--border-control` | `#60636F` | `#888B99` | Bordure de bouton, champ, bascule. **3,10 / 3,37** — cible 3:1 tenue. |
| `--text-primary` | `#EBECF2` | `#1B1D28` | Titres, phrases de l'agent, valeurs. **14,20 / 16,70** |
| `--text-secondary` | `#BABCC4` | `#4D4F5A` | Entreprise, lieu, sous-titre. **8,77 / 8,13** |
| `--text-muted` | `#9799A1` | `#666872` | Libellés de colonne, horodatage. **5,90 / 5,52** — rien de lisible n'est « gris décoratif ». |
| `--accent-machine` | `#59C2D4` | `#006B7E` | **Ce que la machine a fait.** Teinte conservée (H 210), clarté descendue de 0,760 à 0,470. **8,05 / 6,20** |
| `--accent-attente` | `#E4AF6C` | `#804E00` | **Ce qui attend un humain.** H 72. Jamais employé pour la fraîcheur. **8,51 / 6,97** |
| `--accent-critique` | `#E88F87` | `#983432` | Échec technique, suppression, arrêt. **Par événement, jamais en permanence.** **6,91 / 7,32** |
| `--text-on-fill` | `#0D0E13` | `#FDFDFF` | Texte sur aplat d'accent. Mesuré sur `--accent-attente`, le pire cas. **9,82 / 6,87** |
| `--focus-ring` | `#86E2F2` | `#006B7E` | 2 px + décalage 2 px. **11,23 / 6,20**. `outline: none` sans remplacement visible = ticket rejeté. |

### Score et paliers

| Token | Valeur | Règle |
|---|---|---|
| `--score-tick-plein` | `--accent-machine` | Le score se lit **d'abord au chiffre**, ensuite aux barres. |
| `--score-tick-vide` | `--border-control` | Cinq crans, **jamais un dégradé**. |
| `--palier-a` | `--accent-machine` + 4 barres | Board d'entreprise, relevé 2–5 min. |
| `--palier-b` | `--text-secondary` + 2 barres | Agrégateur ou portail public, 15–60 min. |
| `--palier-c` | `--text-muted` + 1 barre creuse | Plateforme non couverte : on assiste, on ne postule pas. |

### Espacement, rayons, mouvement

| Token | Valeur |
|---|---|
| `--space-1…8` | `4 8 12 16 22 30 44 64` |
| `--radius-*` | module `0` · contrôle `3` · pastille `6` · état rond `50%` |
| `--duration-*` | bascule `120ms` · changement d'état `180ms` · panneau `260ms` · **`0ms` sous `prefers-reduced-motion`**, où le changement est porté par le texte et la forme |
| `--touch-min` | `44px` de haut et de large, **8 px d'écart réel** entre deux cibles voisines. Lignes de tableau tactiles : `52px`. |

---

## 2. Échelle typographique — un cas d'usage par palier

| Palier | Spécification | Cas d'usage **unique** |
|---|---|---|
| **D1** | 26 / 1,15 · 600 · −0,02em | Titre d'écran en 1280. **Un seul par écran.** |
| **D2** | 22 / 1,2 · 600 · −0,018em | Titre d'écran en 390, titre d'offre. |
| **T1** | 17 / 1,3 · 600 · −0,015em | **La question de décision.** Réservé aux zones où l'agent demande quelque chose. |
| **B1** | 15 / 1,5 · 400 | Corps de décision — la voix de l'agent, en phrases complètes. |
| **B2** | 13,5 / 1,45 · 400 | Corps dense : suivi, listes, tableaux. **Plancher de lisibilité du produit.** |
| **L1** | 12 / 1,3 · Mono 500 · +0,06em | Donnée d'appui : heure, source, palier, identifiant. |
| **L2** | 10,5 / 1,3 · Mono 500 · +0,12em | Titre de colonne et de module. Seul palier sous 12 px : **jamais une phrase, jamais une donnée.** |
| **N1** | 20 · Mono 600 tabulaire | Score en liste, montant, compteur. |
| **N2** | 40 · Mono 600 tabulaire | Score déplié. **Toujours accompagné de ses preuves.** |

`font-variant-numeric: tabular-nums` est appliqué **à la racine**. Montants cadrés à droite, heures à gauche.

---

## 3. Grille et points de rupture

| Largeur | Structure |
|---|---|
| **390** | 4 colonnes · marge 16 · gouttière 12 · une seule colonne de contenu · barre d'action fixe en bas |
| **768** | 8 colonnes · marge 24 · gouttière 16 · rail replié en barre haute |
| **1280** | rail 196 + 12 colonnes · marge 22 · gouttière 16 · panneau latéral 300 |
| **1600** | rail 220 + contenu plafonné à 1 180 + panneau 300 · le surplus va à la marge, **pas à la ligne de texte** |

> Un tableau de 1280 réduit à 390 n'est pas responsive. **Sous 768, tout tableau devient une liste
> de lignes de 52 px** avec deux valeurs visibles et le reste au dépliage.

---

## 4. Langage de statut — forme + libellé, jamais la couleur seule

| Statut | Ce que ça veut dire pour l'utilisateur | Forme (sans couleur) |
|---|---|---|
| Détectée | Je l'ai vue, je ne l'ai pas encore jugée. | cercle creux |
| En file — votre accord | Prête, rien n'est parti. J'attends. | losange plein |
| Escalade — je rends la main | Le formulaire m'a bloqué. Je vous dis où et pourquoi. | triangle |
| Envoyée | Partie, avec un reçu horodaté. | carré plein |
| Consultée | Quelqu'un a ouvert votre dossier. | coche |
| Entretien | Un rendez-vous est pris. Je prépare le brief. | carré épais creux |
| Sans réponse | Le marché n'a pas répondu. **Ce n'est pas votre échec.** | tiret |
| Échec technique | L'envoi n'est pas passé. Voici quoi, pourquoi, et quoi faire. | croix |

### Fraîcheur — le palier avec l'âge, toujours

- **Palier A · il y a 4 min** — board de l'entreprise, relevé 2–5 min. *« Vous êtes parmi les premiers dossiers. »*
- **Palier B · vue il y a 22 min** — agrégateur, relevé 15–60 min. *« Publiée avant, je ne sais pas quand. »* **Aucune promesse de rang.**
- **Palier C · sans relevé** — plateforme non parcourable. *« Je vous assiste, je ne postule pas. »*

> Pas de compte à rebours, pas de rouge, pas de clignotement. L'histogramme décroît : **c'est une
> mesure, pas une alarme.** Et jamais de rang chiffré — « 3ᵉ candidat » est une information que nous
> n'avons pas.

---

## 5. Les quatre états — dans les deux thèmes

- **Chargement** — le squelette a la forme **exacte** des lignes à venir (trois colonnes, 52 px). Aucun spinner. Sous `prefers-reduced-motion` il ne pulse pas : le texte porte l'activité.
- **Vide = onboarding** — porte une action, pas seulement une phrase. *« Je ne sais pas encore ce que je cherche pour vous. Donnez-moi un intitulé et une zone. »*
- **Erreur** — ce qui a échoué, depuis quand, et **ce que ça n'implique pas** (« ce n'est pas une absence d'offres »).
- **Trop de données** — ce qui est montré, ce qui est écarté et pourquoi ; le reste consultable, jamais caché.

---

## 6. Critères globaux G1–G6

**Contrat transversal. Ne pas répéter dans chaque ticket — un ticket qui les viole est rejeté.**

| # | Critère |
|---|---|
| **G1** | Corps ≥ 4,5:1, grand texte et parties non textuelles de contrôle ≥ 3:1, **en clair et en sombre**. |
| **G2** | Anneau de focus 2 px + décalage 2 px (`--focus-ring`). `outline: none` sans remplacement visible = **ticket rejeté**. |
| **G3** | Cible tactile ≥ 44 × 44 px, 8 px d'écart réel. Lignes de tableau tactiles à 52 px. |
| **G4** | `prefers-reduced-motion` : durées à 0, **aucune information portée par le seul mouvement**. |
| **G5** | Aucun statut porté par la couleur seule : forme + libellé obligatoires, **vérifié en niveaux de gris**. |
| **G6** | FR et EN conçus ensemble. Test de troncature à 390 px avec la chaîne FR la plus longue de la story. |

---

## 7. Ce qui fait échouer une revue de design

Un score sans explication atteignable · un statut porté par la couleur seule · un anneau de focus
supprimé · une cible sous 44 px · un état vide sans action · un compte à rebours ou un rouge
permanent sur la fraîcheur · un rang de candidature inventé · une troncature en français à 390 px ·
un contraste estimé au lieu de mesuré · crème + serif + terracotta · dégradé violet vers bleu ·
emojis en marqueurs de section · rayon unique appliqué partout · barre d'accent colorée sur carte
arrondie · ressemblance avec un concurrent RH existant.
