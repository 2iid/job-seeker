# Backlog Kanban — miroir lisible de `scripts/kanban/issues.csv`

> Source de vérité : le CSV. Miroir régénéré ; ne pas éditer à la main.

**83 issues** · toutes les exigences de la spec couvertes · design intégré (`docs/design/user-stories-mapping.md`).

## Sprint 1 — Fondations et la pointe qui peut tout changer

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-001` | Initialiser le monorepo Next.js 15 avec TypeScript lint et tests | EPIC 0 — Fondation | devops-engineer | P0 | M | — | — | yes |
| `JOB-002` | Pointe technique soumission ATS sur 20 formulaires réels | EPIC 0 — Fondation | backend-engineer | P0 | L | — | REQ-011 | no |
| `JOB-003` | Chargement et validation stricte des variables d environnement | EPIC 0 — Fondation | backend-engineer | P0 | S | JOB-001 | — | yes |
| `JOB-004` | Projet Supabase et première migration | EPIC 0 — Fondation | database-architect | P0 | M | JOB-001 | — | yes |
| `JOB-005` | Socle RLS deny-by-default avec tests allow et deny | EPIC 0 — Fondation | security-engineer | P0 | M | JOB-004 | REQ-014 | yes |
| `JOB-006` | Authentification et session serveur | EPIC 0 — Fondation | backend-engineer | P0 | M | JOB-005 | — | yes |
| `JOB-007` | Contrat de vérification vantry.yml et smoke initial | EPIC 0 — Fondation | devops-engineer | P0 | S | JOB-001 | — | yes |
| `JOB-008` | Pipeline CI avec lint tests scan de secrets et scan de vulnérabilités | EPIC 0 — Fondation | devops-engineer | P0 | S | JOB-007 | — | yes |
| `JOB-009` | Squelette du worker conteneurisé avec file durable et reprise | EPIC 0 — Fondation | backend-engineer | P0 | M | JOB-003 | — | no |
| `JOB-010` | Observabilité erreurs logs structurés et sonde de santé | EPIC 0 — Fondation | devops-engineer | P1 | S | JOB-009 | — | yes |
| `JOB-011` | Traduire la direction de marque retenue en tokens sémantiques | EPIC 1 — Système d interface | ui-ux-designer | P0 | M | JOB-001 | — | no |

## Sprint 2 — Le moteur de veille et le système d'interface

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-012` | Thème clair et sombre à parité avec contrastes mesurés | EPIC 1 — Système d interface | ui-ux-designer | P0 | S | JOB-011 | — | no |
| `JOB-013` | Primitives d interface et quatre états génériques | EPIC 1 — Système d interface | frontend-engineer | P0 | M | JOB-011 | — | no |
| `JOB-014` | Composant signature indicateur de score dépliable | EPIC 1 — Système d interface | frontend-engineer | P0 | M | JOB-013 | REQ-005 | no |
| `JOB-015` | Composant signature carte d approbation | EPIC 1 — Système d interface | frontend-engineer | P0 | M | JOB-013 | REQ-010 | no |
| `JOB-016` | Composant signature ligne de vie de l agent | EPIC 1 — Système d interface | frontend-engineer | P1 | M | JOB-013 | REQ-013 | no |
| `JOB-017` | Composant signature indicateur de fraîcheur par palier | EPIC 1 — Système d interface | frontend-engineer | P0 | S | JOB-013 | REQ-004 | no |
| `JOB-018` | Internationalisation français et anglais avec vérification à 390 px | EPIC 1 — Système d interface | frontend-engineer | P0 | M | JOB-013 | — | no |
| `JOB-019` | Contrat de connecteur et registre de sources | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-009 | REQ-003 | no |
| `JOB-020` | Normalisation des offres avec devise périodicité et fuseau | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-019 | REQ-003;REQ-004 | no |
| `JOB-021` | Connecteurs ATS du palier A pour cinq fournisseurs | EPIC 2 — Moteur de veille | backend-engineer | P0 | L | JOB-020 | REQ-003 | no |
| `JOB-022` | Résolution du board ATS depuis la page carrière | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-021 | REQ-003 | no |
| `JOB-023` | Lecture des offres schema.org JobPosting | EPIC 2 — Moteur de veille | backend-engineer | P1 | S | JOB-022 | REQ-003 | no |
| `JOB-024` | Connecteurs du palier B agrégateurs et portails multi-pays | EPIC 2 — Moteur de veille | backend-engineer | P0 | L | JOB-020 | REQ-003 | no |
| `JOB-025` | Registre d entreprises partagé et diffusion multi-utilisateurs | EPIC 2 — Moteur de veille | database-architect | P0 | M | JOB-020 | REQ-003 | yes |
| `JOB-027` | Déduplication inter-sources et inter-paliers | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-020 | REQ-003 | no |
| `JOB-028` | Cadence par domaine retrait progressif et état par source | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-019 | REQ-003 | no |
| `JOB-030` | Modèle de données profil documents et candidatures avec RLS | EPIC 3 — Profil et CV | database-architect | P0 | M | JOB-005 | REQ-001;REQ-002 | yes |

## Sprint 3 — Profil correspondance et couverture réelle

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-026` | Promotion automatique d une entreprise du palier B vers le palier A | EPIC 2 — Moteur de veille | backend-engineer | P1 | M | JOB-025;JOB-022 | REQ-003 | no |
| `JOB-029` | Planificateur des paliers A et B | EPIC 2 — Moteur de veille | backend-engineer | P0 | M | JOB-028 | REQ-003 | no |
| `JOB-031` | Import de CV et extraction structurée | EPIC 3 — Profil et CV | ai-integration-engineer | P0 | L | JOB-030 | REQ-001 | yes |
| `JOB-032` | Écran de confirmation de l extraction du CV | EPIC 3 — Profil et CV | frontend-engineer | P0 | M | JOB-031;JOB-013 | REQ-001 | no |
| `JOB-033` | Profil canonique édition et versionnement | EPIC 3 — Profil et CV | frontend-engineer | P0 | M | JOB-032 | REQ-002 | no |
| `JOB-034` | Critères de recherche préférences et exclusions | EPIC 3 — Profil et CV | frontend-engineer | P0 | M | JOB-033 | REQ-002 | no |
| `JOB-035` | Moteur de score de correspondance explicable | EPIC 4 — Correspondance | ai-integration-engineer | P0 | L | JOB-027;JOB-034 | REQ-005 | yes |
| `JOB-036` | Critères rédhibitoires bloquant la soumission automatique | EPIC 4 — Correspondance | backend-engineer | P0 | S | JOB-035 | REQ-005 | yes |
| `JOB-038` | Flux d opportunités avec fraîcheur provenance et filtres persistants | EPIC 4 — Correspondance | frontend-engineer | P0 | L | JOB-035;JOB-017 | REQ-004 | no |
| `JOB-039` | Détail d une offre avec score déplié en preuves | EPIC 4 — Correspondance | frontend-engineer | P0 | M | JOB-038;JOB-014 | REQ-004;REQ-005 | no |
| `JOB-072` | Instrumentation du coût LLM par candidature | EPIC 10 — Facturation et lancement | devops-engineer | P0 | S | JOB-010 | — | yes |
| `JOB-076` | Mesure de couverture sur cinq profils contrastés | EPIC 2 — Moteur de veille | product-strategist | P0 | M | JOB-029;JOB-024 | REQ-003 | no |
| `JOB-081` | Parcours d entrée jusqu à la première offre trouvée en direct | EPIC 3 — Profil et CV | frontend-engineer | P0 | L | JOB-032;JOB-035 | REQ-001;REQ-002 | no |
| `JOB-082` | Palier C plateformes assistées détection sans candidature | EPIC 2 — Moteur de veille | backend-engineer | P1 | M | JOB-019 | REQ-003 | no |
| `JOB-083` | Connecteur Workable verifie contre une reponse reelle | EPIC 2 — Moteur de veille | backend-engineer | P1 | S | JOB-021 | REQ-003 | no |

## Sprint 4 — Documents gouvernance de l'agent et traçabilité

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-037` | Reproductibilité du score et conservation des preuves | EPIC 4 — Correspondance | backend-engineer | P1 | M | JOB-035 | REQ-005 | yes |
| `JOB-040` | Génération de CV adapté contrainte au profil canonique | EPIC 5 — Documents | ai-integration-engineer | P0 | L | JOB-033;JOB-035 | REQ-007 | yes |
| `JOB-041` | Vue de différence et refus modification par modification | EPIC 5 — Documents | frontend-engineer | P0 | M | JOB-040 | REQ-007 | no |
| `JOB-042` | Mise au format de CV attendu par le marché visé | EPIC 5 — Documents | ai-integration-engineer | P1 | M | JOB-040 | REQ-007 | yes |
| `JOB-043` | Export PDF fidèle et lisible par un ATS | EPIC 5 — Documents | backend-engineer | P0 | M | JOB-040 | REQ-007 | yes |
| `JOB-044` | Génération de lettre dans la langue de l offre | EPIC 5 — Documents | ai-integration-engineer | P0 | M | JOB-040 | REQ-008 | yes |
| `JOB-045` | Bibliothèque de réponses aux questions de screening | EPIC 5 — Documents | frontend-engineer | P0 | M | JOB-030 | REQ-008 | no |
| `JOB-046` | Cadran d autonomie par canal et mandat horodaté | EPIC 6 — Automatisation | backend-engineer | P0 | M | JOB-030 | REQ-009 | yes |
| `JOB-047` | Quotas journaliers et plages horaires dans le fuseau du candidat | EPIC 6 — Automatisation | backend-engineer | P0 | M | JOB-046 | REQ-009 | yes |
| `JOB-048` | File d approbation utilisable au pouce et au clavier | EPIC 6 — Automatisation | frontend-engineer | P0 | L | JOB-046;JOB-015 | REQ-010 | no |
| `JOB-052` | Défense contre l injection par le contenu d une offre | EPIC 6 — Automatisation | security-engineer | P0 | M | JOB-044 | REQ-011;REQ-016 | yes |
| `JOB-053` | Arrêt d urgence global effectif sous cinq secondes | EPIC 6 — Automatisation | backend-engineer | P0 | M | JOB-047 | REQ-012 | yes |
| `JOB-054` | Table de reçus immuable en insertion seule | EPIC 7 — Traçabilité | database-architect | P0 | M | JOB-005 | REQ-013 | yes |

## Sprint 5 — Soumission suivi et conformité

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-049` | Soumission de candidature par navigateur piloté | EPIC 6 — Automatisation | backend-engineer | P0 | XL | JOB-002;JOB-044 | REQ-011 | yes |
| `JOB-050` | Escalade obligatoire sur anti-robot et champ inconnu | EPIC 6 — Automatisation | backend-engineer | P0 | M | JOB-049 | REQ-011 | yes |
| `JOB-051` | Idempotence de soumission et détection de doublon | EPIC 6 — Automatisation | backend-engineer | P0 | M | JOB-049 | REQ-011 | yes |
| `JOB-055` | Écriture d un reçu pour chaque action sortante | EPIC 7 — Traçabilité | backend-engineer | P0 | M | JOB-054;JOB-049 | REQ-013 | yes |
| `JOB-056` | Consultation et export des reçus par leur propriétaire | EPIC 7 — Traçabilité | frontend-engineer | P0 | S | JOB-055;JOB-016 | REQ-013 | no |
| `JOB-057` | Journal d audit incluant les accès du support | EPIC 7 — Traçabilité | security-engineer | P0 | M | JOB-005 | REQ-014 | yes |
| `JOB-058` | Export de données en libre-service | EPIC 7 — Traçabilité | backend-engineer | P0 | M | JOB-057 | REQ-014 | yes |
| `JOB-059` | Suppression dure avec annulation préalable de l automatisation | EPIC 7 — Traçabilité | backend-engineer | P0 | M | JOB-053;JOB-057 | REQ-014 | yes |
| `JOB-060` | Pipeline de suivi des candidatures et transitions manuelles | EPIC 8 — Suivi | frontend-engineer | P0 | L | JOB-055 | REQ-015 | no |
| `JOB-061` | Connexion à la boîte mail en lecture restreinte | EPIC 8 — Suivi | backend-engineer | P0 | L | JOB-030 | REQ-015 | yes |
| `JOB-065` | Identification des contacts recruteurs avec niveau de certitude | EPIC 9 — Contact recruteur | ai-integration-engineer | P0 | L | JOB-035 | REQ-016 | yes |
| `JOB-073` | Limitation de débit sur les routes abusables | EPIC 10 — Facturation et lancement | security-engineer | P0 | M | JOB-006 | — | yes |

## Sprint 6 — Contact recruteur facturation et ouverture

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-062` | Rattachement des réponses reçues à la bonne candidature | EPIC 8 — Suivi | ai-integration-engineer | P0 | M | JOB-061;JOB-060 | REQ-015 | yes |
| `JOB-063` | Poste de commande avec vue attention du jour | EPIC 8 — Suivi | frontend-engineer | P0 | L | JOB-060;JOB-048 | REQ-015 | no |
| `JOB-064` | Notifications sobres limitées à trois événements | EPIC 8 — Suivi | backend-engineer | P1 | M | JOB-063 | REQ-015 | no |
| `JOB-066` | Rédaction de l email de contact personnalisé | EPIC 9 — Contact recruteur | ai-integration-engineer | P0 | M | JOB-065;JOB-052 | REQ-016 | yes |
| `JOB-067` | Envoi depuis la boîte du candidat message par message | EPIC 9 — Contact recruteur | backend-engineer | P0 | M | JOB-066;JOB-061 | REQ-016 | yes |
| `JOB-068` | Conservation bornée et opposition sur les données de recruteurs | EPIC 9 — Contact recruteur | security-engineer | P0 | M | JOB-065;JOB-057 | REQ-016 | yes |
| `JOB-069` | Brief entreprise et signaux de recrutement | EPIC 9 — Contact recruteur | ai-integration-engineer | P1 | M | JOB-039 | REQ-016 | no |
| `JOB-070` | Abonnement Stripe et paliers de quota | EPIC 10 — Facturation et lancement | payments-engineer | P0 | L | JOB-047 | — | yes |
| `JOB-071` | Webhook Stripe signé et idempotent | EPIC 10 — Facturation et lancement | payments-engineer | P0 | M | JOB-070 | — | yes |
| `JOB-074` | Audit d accessibilité WCAG 2.1 AA sur les écrans de la boucle | EPIC 10 — Facturation et lancement | ui-ux-designer | P0 | M | JOB-063 | — | yes |
| `JOB-075` | Modèle de menaces STRIDE avant ouverture publique | EPIC 10 — Facturation et lancement | security-engineer | P0 | M | JOB-059 | — | no |
| `JOB-080` | Mode discrétion et masquage des employeurs | EPIC 8 — Suivi | frontend-engineer | P1 | M | JOB-063;JOB-064 | REQ-015 | no |

## Backlog — v1.1 et au-delà

| id | titre | epic | agent | prio | taille | deps | REQ | sécu |
|---|---|---|---|---|---|---|---|---|
| `JOB-077` | Correction du score par le candidat | EPIC 11 — v1.1 | ai-integration-engineer | P2 | M | JOB-048 | REQ-006 | yes |
| `JOB-078` | Séquences de relance autonomes vers les recruteurs | EPIC 11 — v1.1 | backend-engineer | P2 | XL | JOB-067 | — | yes |
| `JOB-079` | A/B des variantes de CV et analyse de l entonnoir | EPIC 11 — v1.1 | ai-integration-engineer | P2 | L | JOB-060 | — | no |

## Contrat de design

Tout ticket portant de l'interface respecte les critères globaux **G1–G6** de
`docs/design/design-system.md` §6. Ils ne se répètent pas ticket par ticket.
