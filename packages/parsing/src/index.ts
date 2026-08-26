/**
 * La porte d'entrée d'un document importé : des octets, un texte ou un refus.
 *
 * Rien ici n'écrit, n'enregistre ni ne crée de ligne. C'est délibéré — REQ-001
 * promet qu'un import raté ne laisse pas de profil partiel, et la façon la plus
 * sûre de tenir cette promesse est que la couche qui LIT ne sache pas écrire.
 */

export { examiner, MIME, PLAFOND_OCTETS } from './type-fichier.ts'
export type { Refus, TypeFichier, Verdict } from './type-fichier.ts'
export { messageDeRefus } from './messages.ts'
export type { Locale } from './messages.ts'
export { cheminStockage, proprietaireDuChemin, CheminInvalide } from './chemin.ts'
export { texteDuDocx, texteDuXml, DocxIllisible } from './docx.ts'
export { textePdf, PdfIllisible } from './pdf.ts'
export { extraire, champ, ExtractionRefusee } from './extraction.ts'
export type { Champ, Confiance, ExperienceProposee, Proposition } from './extraction.ts'

import { examiner, type Refus } from './type-fichier.ts'
import { texteDuDocx, DocxIllisible } from './docx.ts'
import { textePdf, PdfIllisible } from './pdf.ts'

export type Lecture =
  | { ok: true; type: 'pdf' | 'docx'; texte: string }
  | { ok: false; refus: Refus }

/**
 * Lit le texte d'un import, ou dit pourquoi il ne peut pas.
 *
 * Un PDF scanné et un PDF corrompu remontent tous deux comme
 * `type-non-supporte`, mais avec un `constate` différent : c'est ce mot qui
 * permet à l'écran de dire « c'est une image, il n'y a pas de texte à lire »
 * plutôt que « format non supporté », qui enverrait la personne réexporter un
 * fichier déjà au bon format.
 */
export async function lire(octets: Uint8Array): Promise<Lecture> {
  const verdict = examiner(octets)
  if (!verdict.ok) return verdict
  try {
    const texte = verdict.type === 'pdf' ? await textePdf(octets) : texteDuDocx(octets)
    if (texte.trim() === '') return { ok: false, refus: { motif: 'vide' } }
    return { ok: true, type: verdict.type, texte }
  } catch (e) {
    if (e instanceof PdfIllisible) {
      if (e.cas === 'chiffre') return { ok: false, refus: { motif: 'chiffre' } }
      return { ok: false, refus: { motif: 'type-non-supporte', constate: e.cas } }
    }
    if (e instanceof DocxIllisible) {
      return { ok: false, refus: { motif: 'type-non-supporte', constate: 'docx illisible' } }
    }
    throw e
  }
}
export { lireDate, afficherDate } from './dates.ts'
export type { DateCv, Precision } from './dates.ts'
