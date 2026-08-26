/**
 * Ce qu'on dit à la personne quand l'import est refusé.
 *
 * Un refus qui ne dit pas quoi faire est une impasse : REQ-003 interdit de
 * présenter un échec comme une absence, et un « fichier invalide » sec est la
 * version import de cette faute. Chaque message nomme la cause ET la suite.
 *
 * Les deux langues sont ici parce que le message est choisi par le serveur, au
 * moment où il connaît le motif ; les recopier côté écran les ferait diverger.
 */

import type { Refus } from './type-fichier.ts'

export type Locale = 'fr' | 'en'

function mo(octets: number): string {
  return (octets / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')
}

export function messageDeRefus(refus: Refus, locale: Locale): string {
  if (locale === 'en') {
    switch (refus.motif) {
      case 'vide':
        return 'This file is empty. Check that the export finished, then send it again.'
      case 'trop-gros':
        return `This file is ${mo(refus.octets)} MB and the limit is ${mo(refus.plafond)} MB. Export it again without the embedded images, or send a PDF printed from your CV.`
      case 'chiffre':
        return 'This file is password-protected, so its text cannot be read. Remove the password and send it again.'
      case 'type-non-supporte':
        return 'Only PDF and Word (.docx) files can be read. Export your CV in one of those two formats and send it again.'
    }
  }
  switch (refus.motif) {
    case 'vide':
      return 'Ce fichier est vide. Vérifiez que l export s est terminé, puis renvoyez-le.'
    case 'trop-gros':
      return `Ce fichier fait ${mo(refus.octets)} Mo et la limite est de ${mo(refus.plafond)} Mo. Réexportez-le sans les images intégrées, ou envoyez un PDF imprimé depuis votre CV.`
    case 'chiffre':
      return 'Ce fichier est protégé par un mot de passe, son texte ne peut donc pas être lu. Retirez le mot de passe et renvoyez-le.'
    case 'type-non-supporte':
      return 'Seuls les fichiers PDF et Word (.docx) peuvent être lus. Exportez votre CV dans l un de ces deux formats et renvoyez-le.'
  }
}
