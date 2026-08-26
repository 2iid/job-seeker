/**
 * Lire le texte d'un PDF.
 *
 * Le PDF n'est pas un format de texte : c'est un format de POSITIONS. Rien n'y
 * garantit qu'un mot est stocké d'un seul tenant, ni que l'ordre des glyphes
 * dans le fichier est l'ordre de lecture. On délègue donc à pdf.js (via unpdf,
 * qui en embarque la construction sans dépendance native), qui reconstitue
 * l'ordre de lecture — puis on rétablit les sauts de ligne.
 *
 * Deux cas ont leur message dédié, parce qu'ils sont les plus fréquents sur un
 * CV réel et que « illisible » n'aiderait personne : le PDF protégé par mot de
 * passe, et le PDF SCANNÉ — une image, sans aucune couche texte. Le second est
 * silencieux si on ne le cherche pas : l'extraction réussit et rend une chaîne
 * vide, et on créerait un profil vide en croyant avoir lu un CV.
 */

export class PdfIllisible extends Error {
  readonly cas: 'chiffre' | 'scanne' | 'corrompu'
  constructor(cas: 'chiffre' | 'scanne' | 'corrompu', message: string, options?: ErrorOptions) {
    super(message, options)
    this.cas = cas
  }
}

/** En dessous, il n'y a pas de CV — il y a un en-tête de page sur une image. */
const MINIMUM_CARACTERES = 80

export async function textePdf(octets: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  let doc
  try {
    // Une COPIE, et ce n'est pas de la prudence décorative : pdf.js prend
    // possession du tampon qu'on lui donne et le DÉTACHE. Les octets de
    // l'appelant deviennent alors un tableau vide, en silence — donc le même
    // fichier, lu puis stocké, serait stocké vide, et « le fichier d'origine
    // reste re-téléchargeable » ne tiendrait plus. Un test le verrouille.
    doc = await getDocumentProxy(octets.slice())
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    if (/password/i.test(message)) {
      throw new PdfIllisible('chiffre', 'le PDF est protege par un mot de passe', { cause: e })
    }
    throw new PdfIllisible('corrompu', 'le PDF ne peut pas etre ouvert', { cause: e })
  }
  const { text } = await extractText(doc, { mergePages: true })
  const propre = (Array.isArray(text) ? text.join('\n') : text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (propre.replace(/\s/g, '').length < MINIMUM_CARACTERES) {
    throw new PdfIllisible(
      'scanne',
      'le PDF ne contient pas de couche texte — c est probablement un scan',
    )
  }
  return propre
}
