/**
 * Lire le texte d'un .docx, sans faire confiance à l'archive.
 *
 * Un .docx est un zip. Le lire, c'est donc décompresser un fichier fourni par
 * l'utilisateur — et une archive est un format ADVERSAIRE : elle annonce
 * elle-même la taille de ce qu'elle contient. Une archive de 200 Ko peut
 * annoncer, et produire, plusieurs gigaoctets. On ne croit donc aucune taille
 * déclarée : on décompresse en bornant la SORTIE, et on s'arrête net au
 * plafond.
 *
 * On ne dépend pas d'une bibliothèque de zip pour ça : la surface utile est
 * une seule pièce à un seul endroit (`word/document.xml`), et une dépendance
 * de plus qui lit un fichier hostile est une surface de plus.
 */

import { inflateRawSync } from 'node:zlib'

/** Ce qu'un CV peut raisonnablement peser une fois décompressé. Au-delà : bombe. */
const PLAFOND_DECOMPRESSE = 40 * 1024 * 1024

export class DocxIllisible extends Error {}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

function u16(v: DataView, o: number): number { return v.getUint16(o, true) }
function u32(v: DataView, o: number): number { return v.getUint32(o, true) }

/** Retrouve la fin du répertoire central, en remontant depuis la fin. */
function trouverEocd(v: DataView): number {
  const min = Math.max(0, v.byteLength - 66_000) // 64 Ko de commentaire, au plus
  for (let i = v.byteLength - 22; i >= min; i -= 1) {
    if (u32(v, i) === EOCD) return i
  }
  throw new DocxIllisible('archive sans repertoire central')
}

/** L'offset de l'en-tête local de `word/document.xml`, lu dans le répertoire central. */
function offsetDeLaPiece(v: DataView, octets: Uint8Array): number {
  const eocd = trouverEocd(v)
  const nombre = u16(v, eocd + 10)
  let p = u32(v, eocd + 16)
  const nom = 'word/document.xml'
  for (let i = 0; i < nombre; i += 1) {
    if (p + 46 > v.byteLength || u32(v, p) !== CENTRAL) {
      throw new DocxIllisible('repertoire central malforme')
    }
    const lNom = u16(v, p + 28)
    const lExtra = u16(v, p + 30)
    const lComm = u16(v, p + 32)
    const courant = new TextDecoder().decode(octets.subarray(p + 46, p + 46 + lNom))
    if (courant === nom) return u32(v, p + 42)
    p += 46 + lNom + lExtra + lComm
  }
  throw new DocxIllisible('archive sans word/document.xml')
}

function decompresser(v: DataView, octets: Uint8Array, offset: number): Uint8Array {
  if (offset + 30 > v.byteLength) throw new DocxIllisible('en-tete local hors limites')
  const methode = u16(v, offset + 8)
  const lNom = u16(v, offset + 26)
  const lExtra = u16(v, offset + 28)
  const debut = offset + 30 + lNom + lExtra
  // On donne au décompresseur TOUT le reste de l'archive plutôt que la
  // longueur annoncée : la longueur annoncée peut mentir, le flux
  // « deflate » porte sa propre fin, et zlib s'arrête dessus.
  const brut = octets.subarray(debut)
  if (methode === 0) {
    if (brut.length > PLAFOND_DECOMPRESSE) throw new DocxIllisible('piece trop volumineuse')
    return brut
  }
  if (methode !== 8) throw new DocxIllisible(`compression ${methode} non supportee`)
  try {
    return new Uint8Array(inflateRawSync(brut, { maxOutputLength: PLAFOND_DECOMPRESSE }))
  } catch (e) {
    // `maxOutputLength` dépassé se présente comme une erreur de décompression :
    // on nomme le cas plutôt que de laisser fuiter un message de zlib.
    throw new DocxIllisible(
      brut.length > 0 ? 'flux compresse illisible ou trop volumineux' : 'piece vide',
      { cause: e },
    )
  }
}

const ENTITES: Readonly<Record<string, string>> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

/**
 * Du XML de Word vers du texte.
 *
 * On ne garde que ce qui porte du sens pour une extraction de CV : le texte
 * (`w:t`), les fins de paragraphe et les sauts de ligne. La mise en forme est
 * écartée — mais les RETOURS À LA LIGNE sont conservés, parce qu'un CV est une
 * suite de blocs et qu'aplatir tout en une ligne rend « 2019 — 2021 Société »
 * indiscernable de la ligne suivante.
 */
export function texteDuXml(xml: string): string {
  const avecSauts = xml
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
  const morceaux: string[] = []
  for (const m of avecSauts.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|(\n|\t)/g)) {
    morceaux.push(m[1] ?? m[2] ?? '')
  }
  return morceaux
    .join('')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTITES[e] ?? e)
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function texteDuDocx(octets: Uint8Array): string {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  const xml = new TextDecoder().decode(decompresser(v, octets, offsetDeLaPiece(v, octets)))
  return texteDuXml(xml)
}
