import { describe, expect, it } from 'vitest'
import { textePdf } from '@job-seeker/parsing'
import { ecrirePdf, encoderWinAnsi, type DocumentPdf } from './pdf.ts'

const DOC: DocumentPdf = {
  titre: 'CV — Amina Diallo',
  blocs: [
    { type: 'titre', texte: 'Amina Diallo' },
    { type: 'ligne', texte: 'Cheffe de projet marketing — Dakar, Sénégal' },
    { type: 'espace' },
    { type: 'section', texte: 'EXPÉRIENCE' },
    { type: 'ligne', texte: 'Wave Sénégal — Responsable acquisition (depuis 2021)' },
    { type: 'ligne', texte: 'Pilotage du budget d’acquisition et de trois agences.' },
    { type: 'espace' },
    { type: 'section', texte: 'FORMATION' },
    { type: 'ligne', texte: 'Master Marketing, ISM Dakar (2019)' },
  ],
}

describe('le PDF est un vrai PDF', () => {
  it('commence par la signature et se termine par %%EOF', () => {
    const o = ecrirePdf(DOC)
    expect(new TextDecoder('latin1').decode(o.subarray(0, 8))).toContain('%PDF-1.')
    expect(new TextDecoder('latin1').decode(o.subarray(-8))).toContain('%%EOF')
  })

  it('ne contient AUCUNE image', () => {
    // C'est le mode d'échec qu'on prévient : un PDF-image est superbe, il
    // s'imprime bien, et l'ATS de l'employeur n'y lit RIEN. La personne ne le
    // saura jamais — elle croira que son profil ne convenait pas.
    const brut = new TextDecoder('latin1').decode(ecrirePdf(DOC))
    expect(brut).not.toContain('/XObject')
    expect(brut).not.toContain('/Image')
    expect(brut).toContain('/Type /Font')
  })
})

describe('le texte est RÉELLEMENT sélectionnable', () => {
  it('pdf.js relit tout ce qu’on a écrit — c’est ce que fait un ATS', async () => {
    // La boucle qui compte : on écrit le PDF, puis on le relit avec le même
    // lecteur que celui de JOB-023. Si le texte en ressort ici, il ressortira
    // chez l'employeur.
    const texte = await textePdf(ecrirePdf(DOC))
    expect(texte).toContain('Amina Diallo')
    expect(texte).toContain('Wave')
    expect(texte).toContain('Responsable acquisition')
    expect(texte).toContain('ISM Dakar')
  })

  it('les accents survivent au passage', async () => {
    // Un CV français dont les accents sont perdus est lu de travers par un
    // ATS : « experience » et « expérience » ne se ressemblent que pour un
    // humain.
    const texte = await textePdf(ecrirePdf(DOC))
    expect(texte).toContain('Sénégal')
    expect(texte).toContain('EXPÉRIENCE')
    expect(texte).toContain('d’acquisition')
  })

  it('un mot-clé de l’offre se retrouve dans le fichier', async () => {
    // La question pratique : est-ce qu'un ATS qui cherche « marketing » le
    // trouve ?
    const texte = (await textePdf(ecrirePdf(DOC))).toLowerCase()
    for (const mot of ['marketing', 'acquisition', 'dakar', 'master']) {
      expect(texte, mot).toContain(mot)
    }
  })
})

describe('encoderWinAnsi', () => {
  it('échappe ce qui casserait la syntaxe PDF', () => {
    // Une parenthèse non échappée termine la chaîne et corrompt le fichier —
    // et « (depuis 2021) » est une ligne de CV parfaitement ordinaire.
    expect(encoderWinAnsi('(depuis 2021)')).toBe('\\(depuis 2021\\)')
    expect(encoderWinAnsi('a\\b')).toBe('a\\\\b')
  })

  it('cartographie les caractères CP1252 hors Latin-1', () => {
    // L'apostrophe typographique et le tiret cadratin sont partout dans un CV
    // français, et ils ne sont pas en Latin-1.
    expect(encoderWinAnsi('’').charCodeAt(0)).toBe(146)
    expect(encoderWinAnsi('—').charCodeAt(0)).toBe(151)
    expect(encoderWinAnsi('€').charCodeAt(0)).toBe(128)
  })

  it('translittère plutôt que de rendre un caractère faux', () => {
    // Un « ł » devenu « ? » dans un nom propre est pire qu'un « l ».
    expect(encoderWinAnsi('Łukasz')).toBe('Lukasz')
    expect(encoderWinAnsi('Ștefan')).toBe('Stefan')
  })

  it('avoue quand il ne sait pas, plutôt que d’inventer une lettre', async () => {
    // Se tromper de lettre est pire que de dire qu'on ne sait pas.
    expect(encoderWinAnsi('日本')).toBe('??')
  })
})

describe('mise en page', () => {
  it('replie une ligne trop longue au lieu de la laisser déborder', async () => {
    const long = 'x'.repeat(400)
    const texte = await textePdf(ecrirePdf({ titre: 't', blocs: [{ type: 'ligne', texte: long }, { type: 'ligne', texte: 'Sentinelle finale de contrôle pour la lecture' }] }))
    expect(texte).toContain('Sentinelle finale')
  })
})
