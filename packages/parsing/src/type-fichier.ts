/**
 * Décider ce QU'EST un fichier, à partir de ce qu'il contient.
 *
 * Trois choses prétendent dire le type d'un import : l'extension du nom,
 * l'en-tête `Content-Type` envoyé par le client, et les octets. Les deux
 * premières sont des AFFIRMATIONS de celui qui envoie ; seule la troisième est
 * une preuve. `cv.pdf` renommé depuis `charge.html`, ou un `Content-Type:
 * application/pdf` posé à la main sur un zip, passent n'importe quel contrôle
 * qui les croit sur parole.
 *
 * D'où la règle de REQ-001 : le type est décidé ICI, sur le contenu, et le nom
 * d'origine n'est plus qu'une donnée d'affichage.
 */

export type TypeFichier = 'pdf' | 'docx'

/** Pourquoi un import est refusé — un cas par message que l'écran doit rendre. */
export type Refus =
  | { motif: 'vide' }
  | { motif: 'trop-gros'; octets: number; plafond: number }
  | { motif: 'chiffre' }
  | { motif: 'type-non-supporte'; constate: string }

export type Verdict =
  | { ok: true; type: TypeFichier }
  | { ok: false; refus: Refus }

/** REQ-001. Le plafond est aussi une contrainte de la colonne `taille_octets`. */
export const PLAFOND_OCTETS = 10 * 1024 * 1024

const PDF = [0x25, 0x50, 0x44, 0x46] // %PDF
const ZIP = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04
// Un conteneur OLE/CFB : c'est ce qu'est un .docx protégé par mot de passe, et
// c'est aussi un .doc d'avant 2007. Le distinguer d'un type inconnu permet de
// dire « protégé par un mot de passe » au lieu de « format non supporté », qui
// enverrait la personne convertir un fichier qui n'a rien à se reprocher.
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function commencePar(octets: Uint8Array, signature: readonly number[]): boolean {
  if (octets.length < signature.length) return false
  return signature.every((o, i) => octets[i] === o)
}

/**
 * Un zip est-il un document Word ?
 *
 * Tout `.docx` est un zip, mais tout zip n'est pas un `.docx` — un `.xlsx`, un
 * `.jar`, une archive quelconque commencent par les mêmes quatre octets. On
 * exige donc la présence de `word/document.xml`, la pièce sans laquelle il n'y
 * a pas de texte à extraire.
 *
 * La recherche porte sur les octets bruts plutôt que sur l'index du zip : à ce
 * stade on cherche à IDENTIFIER, pas encore à lire, et un index malformé ne
 * doit pas faire échouer l'identification avant que le message de refus soit
 * choisi.
 */
function contientPieceWord(octets: Uint8Array): boolean {
  const cible = new TextEncoder().encode('word/document.xml')
  outer: for (let i = 0; i + cible.length <= octets.length; i += 1) {
    for (let j = 0; j < cible.length; j += 1) {
      if (octets[i + j] !== cible[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Le verdict d'import, avant toute écriture.
 *
 * Rien n'est stocké, aucune ligne n'est créée, aucun profil partiel n'existe
 * tant que ceci n'a pas répondu `ok`. C'est la seconde promesse de REQ-001 :
 * un fichier refusé ne laisse aucune trace à demi construite derrière lui.
 */
export function examiner(octets: Uint8Array): Verdict {
  if (octets.length === 0) return { ok: false, refus: { motif: 'vide' } }
  if (octets.length > PLAFOND_OCTETS) {
    return {
      ok: false,
      refus: { motif: 'trop-gros', octets: octets.length, plafond: PLAFOND_OCTETS },
    }
  }
  if (commencePar(octets, PDF)) return { ok: true, type: 'pdf' }
  if (commencePar(octets, OLE)) return { ok: false, refus: { motif: 'chiffre' } }
  if (commencePar(octets, ZIP)) {
    if (contientPieceWord(octets)) return { ok: true, type: 'docx' }
    return { ok: false, refus: { motif: 'type-non-supporte', constate: 'archive zip' } }
  }
  return { ok: false, refus: { motif: 'type-non-supporte', constate: 'inconnu' } }
}

/** Le type MIME à enregistrer — dérivé du verdict, jamais de ce que le client a dit. */
export const MIME: Readonly<Record<TypeFichier, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
