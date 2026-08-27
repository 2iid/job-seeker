/**
 * JOB-043 / REQ-007 — l'export PDF, avec un texte RÉELLEMENT sélectionnable.
 *
 * « Export PDF fidèle à l'aperçu, avec un texte réellement sélectionnable
 * (lisible par un ATS). »
 *
 * ── Le mode d'échec qu'on prévient ──
 *
 * Beaucoup de générateurs de CV produisent une IMAGE dans un PDF. Le document
 * est superbe, il s'imprime bien, et l'ATS de l'employeur n'y lit rien du
 * tout : la candidature arrive vide dans son système, avec un nom de fichier
 * et zéro mot-clé. La personne ne le saura jamais — elle croira que son profil
 * ne convenait pas.
 *
 * D'où un PDF écrit à la main, avec de vrais objets texte. Pas d'image, pas de
 * rendu HTML rasterisé, pas de dépendance qui pourrait changer d'avis. Et le
 * test relit le PDF produit avec pdf.js pour vérifier que le texte en ressort —
 * c'est-à-dire qu'il fait exactement ce qu'un ATS ferait.
 *
 * ── Pourquoi les polices standard ──
 *
 * Helvetica fait partie des quatorze polices que tout lecteur PDF possède : ne
 * pas l'incorporer garde le fichier léger et évite un problème de licence.
 * Avec `WinAnsiEncoding`, elle couvre les accents français, espagnols,
 * allemands et portugais — soit les marchés que `marche.ts` connaît. Ce qui
 * sort de ce jeu est translittéré plutôt que rendu en carrés vides : un « ł »
 * devenu « ? » dans un nom propre est pire qu'un « l ».
 */

export type Bloc =
  | { readonly type: 'titre'; readonly texte: string }
  | { readonly type: 'section'; readonly texte: string }
  | { readonly type: 'ligne'; readonly texte: string }
  | { readonly type: 'espace' }

export type DocumentPdf = {
  readonly titre: string
  readonly blocs: readonly Bloc[]
}

const TAILLES = { titre: 18, section: 12, ligne: 10 } as const
const INTERLIGNE = { titre: 26, section: 20, ligne: 14, espace: 10 } as const
const MARGE = 56
const LARGEUR = 595 // A4 en points
const HAUTEUR = 842

/**
 * WinAnsi (CP1252) est un sur-ensemble de Latin-1 pour les positions 128-159.
 * On ne cartographie que ce qu'on rencontre réellement dans un CV.
 */
const WINANSI: Readonly<Record<string, number>> = {
  '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135,
  'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151,
  '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159,
}

/** Ce qui n'existe pas en WinAnsi, rendu par son plus proche voisin lisible. */
const TRANSLITTERATION: Readonly<Record<string, string>> = {
  ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ħ: 'h', ı: 'i', ŀ: 'l',
  ș: 's', Ș: 'S', ț: 't', Ț: 'T', ő: 'o', Ő: 'O', ű: 'u', Ű: 'U',
}

/** Encode une chaîne pour un flux PDF : WinAnsi, avec les parenthèses échappées. */
export function encoderWinAnsi(texte: string): string {
  let sortie = ''
  for (const c of texte.normalize('NFC')) {
    const remplace = TRANSLITTERATION[c] ?? c
    for (const d of remplace) {
      const point = WINANSI[d] ?? d.codePointAt(0) ?? 63
      // Au-delà de 255, WinAnsi ne sait pas dire. On rend un « ? » plutôt
      // qu'un octet qui produirait un caractère faux — se tromper de lettre
      // est pire que d'avouer qu'on ne sait pas.
      const octet = point <= 255 ? point : 63
      sortie += octet === 0x28 || octet === 0x29 || octet === 0x5c
        ? `\\${String.fromCharCode(octet)}`
        : String.fromCharCode(octet)
    }
  }
  return sortie
}

/** Découpe une ligne trop longue, en respectant les mots. */
function replier(texte: string, taille: number, largeurUtile: number): string[] {
  // Largeur moyenne d'un caractère en Helvetica, mesurée sur du texte courant.
  // Approximation assumée : elle sert à éviter un débordement, pas à composer.
  const parCaractere = taille * 0.5
  const max = Math.max(20, Math.floor(largeurUtile / parCaractere))
  if (texte.length <= max) return [texte]
  const lignes: string[] = []
  let courante = ''
  for (const mot of texte.split(/\s+/)) {
    if (courante === '') courante = mot
    else if ((courante + ' ' + mot).length <= max) courante += ' ' + mot
    else { lignes.push(courante); courante = mot }
  }
  if (courante !== '') lignes.push(courante)
  return lignes
}

/**
 * Écrit le PDF.
 *
 * Un seul flux de contenu, des objets texte `BT … Tj … ET`. Aucune image,
 * aucun `XObject` : un ATS qui lit ce fichier trouve les mots.
 */
export function ecrirePdf(doc: DocumentPdf): Uint8Array {
  const largeurUtile = LARGEUR - 2 * MARGE
  const morceaux: string[] = []
  let y = HAUTEUR - MARGE

  for (const b of doc.blocs) {
    if (b.type === 'espace') { y -= INTERLIGNE.espace; continue }
    const taille = TAILLES[b.type]
    const police = b.type === 'ligne' ? '/F1' : '/F2'
    for (const ligne of replier(b.texte, taille, largeurUtile)) {
      if (y < MARGE) break // une seule page : un CV qui déborde est un CV à raccourcir
      morceaux.push(
        `BT ${police} ${taille} Tf ${MARGE} ${Math.round(y)} Td (${encoderWinAnsi(ligne)}) Tj ET`,
      )
      y -= INTERLIGNE[b.type]
    }
  }

  const contenu = morceaux.join('\n')
  const objets: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title (${encoderWinAnsi(doc.titre)}) /Producer (Cabine) >>`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objets.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const debutXref = pdf.length
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info 7 0 R >>\n`
  pdf += `startxref\n${debutXref}\n%%EOF\n`

  // `latin1` : chaque unité de code devient un octet, ce qui préserve
  // exactement ce que `encoderWinAnsi` a produit. En UTF-8, « é » deviendrait
  // deux octets et le PDF serait corrompu.
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xff)
}
