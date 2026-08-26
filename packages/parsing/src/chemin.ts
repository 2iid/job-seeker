/**
 * Où un document est rangé — et pourquoi ce n'est jamais l'utilisateur qui le
 * décide.
 *
 * Le nom d'origine d'un fichier est une chaîne choisie par la personne qui
 * l'envoie. Utilisé comme chemin, `../../autre/cv.pdf` sort du dossier, et
 * `cv.pdf` tout court permet à deux comptes d'écrire au même endroit. Le nom
 * d'origine est donc conservé comme DONNÉE (colonne `nom_origine`, affichée
 * telle quelle) et jamais comme CHEMIN.
 *
 * Le premier segment est l'identifiant de l'UTILISATEUR — `auth.uid()` — et non
 * celui du profil, alors que la ligne `documents` porte, elle, le profil. Ce
 * n'est pas une incohérence : c'est le point de la décision. La politique qui
 * garde le bucket devient une comparaison de chaînes que l'on relit en une
 * ligne, sans jointure vers `profiles`, donc sans dépendre de la RLS d'une
 * AUTRE table ni de l'existence d'une ligne de profil. Une garde de fichier
 * qui a besoin d'une jointure pour savoir dire non est une garde qu'on peut
 * casser depuis ailleurs.
 */

import type { TypeFichier } from './type-fichier.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CheminInvalide extends Error {}

/**
 * `userId` est l'identifiant `auth.users.id` — celui que `auth.uid()` rend.
 * Le changer changerait la signification de la politique de stockage : les
 * deux se relisent ensemble, ou pas du tout.
 */
export function cheminStockage(userId: string, documentId: string, type: TypeFichier): string {
  // Une garde, pas une politesse : si un identifiant non contrôlé arrivait ici,
  // il deviendrait un segment de chemin. On refuse plutôt que de composer.
  if (!UUID.test(userId)) throw new CheminInvalide('userId n est pas un uuid')
  if (!UUID.test(documentId)) throw new CheminInvalide('documentId n est pas un uuid')
  return `${userId.toLowerCase()}/${documentId.toLowerCase()}.${type}`
}

/** Le propriétaire qu'un chemin désigne — la lecture inverse, pour l'audit et les tests. */
export function proprietaireDuChemin(chemin: string): string | undefined {
  const premier = chemin.split('/')[0]
  return premier !== undefined && UUID.test(premier) ? premier.toLowerCase() : undefined
}
