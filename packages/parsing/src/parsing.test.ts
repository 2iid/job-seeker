import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { examiner, MIME, PLAFOND_OCTETS } from './type-fichier.ts'
import { messageDeRefus } from './messages.ts'
import { cheminStockage, proprietaireDuChemin, CheminInvalide } from './chemin.ts'
import { texteDuDocx, texteDuXml, DocxIllisible } from './docx.ts'
import { textePdf, PdfIllisible } from './pdf.ts'
import { lire } from './index.ts'

// Des fichiers produits par de VRAIS outils (textutil pour le .docx, CUPS pour
// le PDF), pas par notre propre écrivain : un lecteur éprouvé contre son propre
// écrivain ne prouve que leur accord, jamais leur justesse.
const fixture = (nom: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${nom}`, import.meta.url)))

const DOCX = fixture('cv-reel.docx')
const PDF = fixture('cv-reel.pdf')
const SCANNE = fixture('cv-scanne.pdf')

const UTILISATEUR = '3f1b9c22-8a4d-4f6e-9b21-0c7d5e4a1f88'
const DOCUMENT = 'a0e2c4d6-1b3f-4a58-8c9d-2e6f0b1a3c5d'

describe('examiner — le type vient du contenu', () => {
  it('reconnaît un vrai PDF et un vrai .docx', () => {
    expect(examiner(PDF)).toEqual({ ok: true, type: 'pdf' })
    expect(examiner(DOCX)).toEqual({ ok: true, type: 'docx' })
  })

  it('refuse un fichier vide', () => {
    expect(examiner(new Uint8Array(0))).toEqual({ ok: false, refus: { motif: 'vide' } })
  })

  it('refuse au-delà de 10 Mo', () => {
    const gros = new Uint8Array(PLAFOND_OCTETS + 1)
    gros.set([0x25, 0x50, 0x44, 0x46]) // un vrai en-tête PDF : c'est la TAILLE qui refuse
    const v = examiner(gros)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.refus.motif).toBe('trop-gros')
  })

  it('nomme le chiffrement plutôt que le format quand le conteneur est OLE', () => {
    const ole = new Uint8Array(600)
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(examiner(ole)).toEqual({ ok: false, refus: { motif: 'chiffre' } })
  })

  it('refuse un zip qui ne porte pas word/document.xml', () => {
    // Tout .docx est un zip ; tout zip n'est pas un .docx. Un .xlsx, un .jar ou
    // une archive quelconque commencent par les quatre mêmes octets.
    const zip = new Uint8Array(400)
    zip.set([0x50, 0x4b, 0x03, 0x04])
    const v = examiner(zip)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.refus).toEqual({ motif: 'type-non-supporte', constate: 'archive zip' })
  })

  it("ne croit ni l'extension ni ce que le client annonce", () => {
    // Le fichier s'appellerait « cv.pdf » et arriverait avec
    // « Content-Type: application/pdf ». Il contient du HTML. Un contrôle qui
    // lit le nom ou l'en-tête le laisse passer ; celui-ci lit les octets.
    const html = new TextEncoder().encode('<html><body>pas un CV</body></html>')
    const v = examiner(html)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.refus).toEqual({ motif: 'type-non-supporte', constate: 'inconnu' })
  })

  it('le type MIME enregistré est dérivé du verdict', () => {
    const v = examiner(DOCX)
    expect(v.ok && MIME[v.type]).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })
})

describe('messageDeRefus — un refus dit quoi faire', () => {
  const motifs = [
    { motif: 'vide' as const },
    { motif: 'trop-gros' as const, octets: 12_000_000, plafond: PLAFOND_OCTETS },
    { motif: 'chiffre' as const },
    { motif: 'type-non-supporte' as const, constate: 'inconnu' },
  ]

  it('donne une suite concrète dans les deux langues', () => {
    for (const refus of motifs) {
      for (const locale of ['fr', 'en'] as const) {
        const m = messageDeRefus(refus, locale)
        expect(m.length).toBeGreaterThan(30)
        // REQ-003 en version import : un « fichier invalide » sec est une
        // impasse. Chaque message contient un verbe d'action.
        expect(m).toMatch(/renvoyez|Réexportez|Retirez|Exportez|again|Remove|Export|Check/)
      }
    }
  })

  it('cite la taille réelle et la limite, pas une formule vague', () => {
    const m = messageDeRefus(motifs[1]!, 'fr')
    expect(m).toContain('11.4 Mo')
    expect(m).toContain('10 Mo')
  })
})

describe('cheminStockage — le nom de fichier ne devient jamais un chemin', () => {
  it("range sous l'utilisateur, avec des identifiants que le serveur connaît", () => {
    expect(cheminStockage(UTILISATEUR, DOCUMENT, 'pdf')).toBe(`${UTILISATEUR}/${DOCUMENT}.pdf`)
  })

  it("le premier segment est l'utilisateur — ce que la politique compare à auth.uid()", () => {
    // Cette forme EST la politique du bucket. La changer ici sans la changer
    // dans la migration ouvrirait le bucket sans qu'aucun test SQL ne bouge.
    expect(proprietaireDuChemin(cheminStockage(UTILISATEUR, DOCUMENT, 'docx'))).toBe(UTILISATEUR)
  })

  it('refuse tout ce qui n\'est pas un uuid, plutôt que de composer', () => {
    // Si un nom fourni par l'utilisateur arrivait ici, il deviendrait un
    // segment de chemin — et « ../../autre » sortirait du dossier du profil.
    expect(() => cheminStockage('../../autre', DOCUMENT, 'pdf')).toThrow(CheminInvalide)
    expect(() => cheminStockage(UTILISATEUR, 'cv.pdf', 'pdf')).toThrow(CheminInvalide)
    expect(() => cheminStockage(UTILISATEUR, `${DOCUMENT}/../${DOCUMENT}`, 'pdf')).toThrow(CheminInvalide)
  })
})

describe('docx', () => {
  it('lit un .docx produit par un vrai outil', () => {
    const texte = texteDuDocx(DOCX)
    expect(texte).toContain('Amina Diallo')
    expect(texte).toContain('Wave Sénégal')
    expect(texte).toContain('ISM Dakar')
  })

  it('garde les retours à la ligne — un CV est une suite de blocs', () => {
    // Aplati sur une ligne, « 2019 — 2021 Société » devient indiscernable de la
    // ligne suivante, et l'extraction rattache l'expérience au mauvais poste.
    const lignes = texteDuDocx(DOCX).split('\n').filter((l) => l.trim() !== '')
    expect(lignes.length).toBeGreaterThan(8)
  })

  it('rétablit les entités XML', () => {
    expect(texteDuXml('<w:p><w:t>R&amp;D &lt;senior&gt;</w:t></w:p>')).toBe('R&D <senior>')
  })

  it('refuse une archive sans la pièce Word', () => {
    const zip = new Uint8Array(80)
    zip.set([0x50, 0x4b, 0x03, 0x04])
    expect(() => texteDuDocx(zip)).toThrow(DocxIllisible)
  })
})

describe('pdf', () => {
  it('lit un vrai PDF, accents compris', async () => {
    const texte = await textePdf(PDF)
    expect(texte).toContain('Amina Diallo')
    expect(texte).toContain('Sénégal')
  })

  it("ne détruit pas les octets de l'appelant", async () => {
    // pdf.js prend possession du tampon qu'on lui passe et le détache. Sans
    // copie, le même fichier lu puis stocké serait stocké VIDE, en silence.
    const avant = PDF.length
    await textePdf(PDF)
    expect(PDF.length).toBe(avant)
    expect(PDF[0]).toBe(0x25) // toujours « % » de %PDF
  })

  it('nomme le PDF scanné au lieu de rendre une chaîne vide', async () => {
    // C'est l'échec SILENCIEUX du lot : l'extraction « réussit », rend du vide,
    // et on créerait un profil vide en croyant avoir lu un CV.
    await expect(textePdf(SCANNE)).rejects.toMatchObject({ cas: 'scanne' })
    await expect(textePdf(SCANNE)).rejects.toBeInstanceOf(PdfIllisible)
  })
})

describe('lire — la porte d\'entrée', () => {
  it('rend le texte des deux formats', async () => {
    for (const octets of [PDF, DOCX]) {
      const r = await lire(octets)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.texte).toContain('Amina Diallo')
    }
  })

  it('rend un refus, jamais une exception, sur un PDF scanné', async () => {
    const r = await lire(SCANNE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refus).toEqual({ motif: 'type-non-supporte', constate: 'scanne' })
  })
})
