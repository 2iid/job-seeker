import { describe, expect, it } from 'vitest'
import { assainir, creerJournal, enregistrerUsage, evaluerSante } from './index'

/** Capture les lignes écrites, pour vérifier ce qui SORT vraiment. */
function journalDeTest() {
  const lignes: string[] = []
  const j = creerJournal({ runtime: 'worker' }, (l) => lignes.push(l), () => '2026-08-25T00:00:00.000Z')
  return { j, lignes, objets: () => lignes.map((l) => JSON.parse(l) as Record<string, unknown>) }
}

describe('un journal est une surface de fuite avant d’être un outil', () => {
  it('n’écrit jamais le contenu d’un CV, d’une lettre ou d’un email', () => {
    const { j, lignes } = journalDeTest()
    j.log('info', 'candidature préparée', {
      cv: 'Léa Marchand — 8 ans chez Payfit, 62 000 €',
      coverLetter: 'Votre équipe design est passée de 4 à 11…',
      emailBody: 'Bonjour Camille,',
      salary: 62000,
    })
    const brut = lignes.join('')
    expect(brut).not.toContain('Léa Marchand')
    expect(brut).not.toContain('Payfit')
    expect(brut).not.toContain('62000')
    expect(brut).not.toContain('Camille')
  })

  it('n’écrit jamais un secret, même s’il est passé par erreur', () => {
    const { j, lignes } = journalDeTest()
    j.log('error', 'appel refusé', { apiKey: 'sk-ant-vraie-cle', authorization: 'Bearer abc', token: 'xyz' })
    const brut = lignes.join('')
    expect(brut).not.toContain('sk-ant-vraie-cle')
    expect(brut).not.toContain('Bearer')
    expect(brut).not.toContain('xyz')
  })

  it('une clé INCONNUE ne passe pas — liste d’autorisation, pas de refus', () => {
    // C'est la propriété qui compte : le champ auquel personne n'a pensé est
    // refusé par défaut. Une liste de refus l'aurait laissé passer.
    const sortie = assainir({ champInventeDemain: 'donnée très personnelle' })
    expect(sortie['champInventeDemain']).not.toContain('personnelle')
    expect(sortie['champInventeDemain']).toMatch(/^\[string:\d+\]$/)
  })

  it('laisse passer ce qui a été jugé sûr, sinon le journal ne sert à rien', () => {
    const { j, objets } = journalDeTest()
    j.log('info', 'travail terminé', { jobId: 'abc-123', jobKind: 'veille', durationMs: 42 })
    expect(objets()[0]).toMatchObject({
      level: 'info', msg: 'travail terminé', jobId: 'abc-123', jobKind: 'veille', durationMs: 42,
      runtime: 'worker',
    })
  })

  it('conserve la trace d’une erreur — elle nomme des fichiers, pas des données', () => {
    const { j, objets } = journalDeTest()
    j.erreur('soumission impossible', new Error('formulaire inconnu'), { jobId: 'j1' })
    const o = objets()[0]
    expect(o?.['errorMessage']).toBe('formulaire inconnu')
    expect(String(o?.['stack'])).toContain('index.test.ts')
    expect(o?.['jobId']).toBe('j1')
  })

  it('un journal enfant hérite du contexte sans le réécrire à chaque ligne', () => {
    const { j, objets } = journalDeTest()
    j.enfant({ jobId: 'j9' }).log('info', 'démarré')
    expect(objets()[0]).toMatchObject({ runtime: 'worker', jobId: 'j9' })
  })
})

describe('vivant n’est pas sain', () => {
  it('une file qui n’avance plus est signalée, même si le processus répond', () => {
    const s = evaluerSante({ queued: 12, running: 0, failed: 0, oldestQueuedSeconds: 900 })
    expect(s.status).toBe('degraded')
    expect(s.raisons[0]).toMatch(/file bloquée/)
  })

  it('des échecs définitifs qui s’accumulent sont signalés', () => {
    const s = evaluerSante({ queued: 0, running: 1, failed: 42, oldestQueuedSeconds: null })
    expect(s.status).toBe('degraded')
    expect(s.raisons.join(' ')).toMatch(/42 travaux en échec/)
  })

  it('une file vide et un worker au repos sont sains — le silence n’est pas une panne', () => {
    expect(evaluerSante({ queued: 0, running: 0, failed: 0, oldestQueuedSeconds: null }).status).toBe('ok')
  })

  it('une file chargée mais qui avance reste saine', () => {
    expect(evaluerSante({ queued: 500, running: 4, failed: 1, oldestQueuedSeconds: 12 }).status).toBe('ok')
  })
})

describe('le coût est mesuré, pas supposé', () => {
  it('chaque appel est attribuable à une candidature', () => {
    const { j, objets } = journalDeTest()
    const cout = enregistrerUsage(
      j,
      { model: 'test-model', inputTokens: 12_000, outputTokens: 800, applicationId: 'cand-7' },
      { inputEurParMillion: 3, outputEurParMillion: 15 },
    )
    expect(cout).toBeCloseTo(0.048, 5)
    expect(objets()[0]).toMatchObject({ applicationId: 'cand-7', costEur: 0.048, model: 'test-model' })
  })
})
