/**
 * Le vocabulaire PARTAGÉ, en français. Le français est la langue de référence :
 * les clés sont dérivées de ce fichier, donc une chaîne absente ici n'existe
 * pour personne.
 *
 * ── Ce qui vit ici, et ce qui n'y vit pas ──
 *
 * Une chaîne employée par PLUSIEURS modules vit ici : un libellé de statut
 * recopié dans cinq composants finit par diverger dans quatre d'entre eux, et
 * personne ne le remarque avant qu'un utilisateur lise deux mots différents
 * pour la même chose.
 *
 * Une chaîne employée par UN SEUL module reste avec lui — les messages de
 * refus d'import (`packages/parsing/messages.ts`) et les conséquences d'un
 * profil incomplet (`packages/profil/completude.ts`) sont déjà bilingues, chez
 * eux. Les déplacer ici séparerait un message de la condition qui le
 * déclenche, et c'est cette proximité qui les garde justes.
 *
 * ── Les accolades ──
 *
 * `{n}` est une substitution. Un test vérifie que les mêmes apparaissent dans
 * les deux langues : une traduction qui perd son `{n}` affiche « il y a
 * minutes » à quelqu'un, et c'est le genre de défaut qu'aucune relecture de
 * code ne voit.
 */

export const fr = {
  // ── Statuts d'une candidature (design-system § 4) ──
  'statut.detectee': 'Détectée',
  'statut.detectee.sens': 'Je l’ai vue, je ne l’ai pas encore jugée.',
  'statut.en-file': 'En file — votre accord',
  'statut.en-file.sens': 'Prête, rien n’est parti. J’attends.',
  'statut.escalade': 'Escalade — je rends la main',
  'statut.escalade.sens': 'Le formulaire m’a bloquée. Je vous dis où et pourquoi.',
  'statut.envoyee': 'Envoyée',
  'statut.envoyee.sens': 'Partie, avec un reçu horodaté.',
  'statut.consultee': 'Consultée',
  'statut.consultee.sens': 'Quelqu’un a ouvert votre dossier.',
  'statut.entretien': 'Entretien',
  'statut.entretien.sens': 'Un rendez-vous est pris. Je prépare le brief.',
  'statut.sans-reponse': 'Sans réponse',
  'statut.sans-reponse.sens': 'Le marché n’a pas répondu. Ce n’est pas votre échec.',
  'statut.echec-technique': 'Échec technique',
  'statut.echec-technique.sens': 'L’envoi n’est pas passé. Voici quoi, pourquoi, et quoi faire.',

  // ── Fraîcheur : le palier avec l'âge, toujours ──
  'palier.a': 'Palier A',
  'palier.a.promesse': 'Vous êtes parmi les premiers dossiers.',
  'palier.a.releve': 'Board de l’entreprise, relevé toutes les 2 à 5 minutes.',
  'palier.b': 'Palier B',
  'palier.b.promesse': 'Publiée avant, je ne sais pas quand.',
  'palier.b.releve': 'Agrégateur, relevé toutes les 15 à 60 minutes.',
  'palier.c': 'Palier C',
  'palier.c.promesse': 'Je vous assiste, je ne postule pas.',
  'palier.c.releve': 'Plateforme non parcourable.',
  'fraicheur.sans-releve': 'sans relevé',
  'fraicheur.a-l-instant': 'à l’instant',
  'fraicheur.minutes': 'il y a {n} min',
  'fraicheur.heures': 'il y a {n} h',
  'fraicheur.jours': 'il y a {n} j',
  'fraicheur.vue': 'vue {age}',

  // ── Score ──
  'score.titre': 'Correspondance {valeur} sur 100',
  'score.deplier': 'Voir sur quoi je me fonde',
  'score.replier': 'Masquer le détail',
  'score.correspondances': 'Ce qui correspond',
  'score.manques': 'Ce qui manque',
  'score.aucune-preuve': 'Je n’ai rien pu citer de l’offre pour appuyer ce score.',
  'score.citations-rejetees': '{n} citation(s) écartée(s) : introuvables dans l’offre.',
  'score.exclue': 'Vous avez demandé à ne pas voir cette offre.',
  'score.bloquants': 'Pourquoi je ne postulerai pas seule',

  // ── Approbation ──
  'approbation.titre': 'Prête à partir — j’attends votre accord',
  'approbation.envoyer': 'Envoyer',
  'approbation.refuser': 'Ne pas envoyer',
  'approbation.modifier': 'Modifier avant d’envoyer',
  'approbation.rien-parti': 'Rien n’est parti. Je n’envoie qu’après votre accord.',
  'approbation.annulable': 'Annulable pendant {n} s après l’envoi.',

  // ── Ligne de vie de l'agent ──
  'agent.ligne-de-vie': 'Ce que j’ai fait',
  'agent.en-veille': 'En veille',
  'agent.au-travail': 'Au travail',
  'agent.arrete': 'Arrêtée',
  'agent.arrete.sens': 'Je ne cherche plus et je n’envoie rien.',
  'agent.rien-a-montrer': 'Rien depuis {age}. Ce n’est pas une panne : le marché est calme.',

  // ── Vocabulaire commun ──
  'commun.chargement': 'Chargement',
  'commun.reessayer': 'Réessayer',
  'commun.fermer': 'Fermer',
  'commun.annuler': 'Annuler',
  'commun.et-n-autres': 'et {n} autre(s)',
} as const
