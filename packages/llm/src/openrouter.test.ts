import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { fournisseurOpenRouter } from './openrouter.ts'
import type { Demande } from './types.ts'

const demande: Demande = {
  systeme: 'système', messages: [{ role: 'user', content: 'salut' }],
  maxTokens: 64, imputableA: 'c1',
}

const avec = (init: ResponseInit, corps: unknown) =>
  fournisseurOpenRouter({
    cle: 'EXAMPLE-inert-no-value',
    fetch: (async () => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
      headers: { 'content-type': 'application/json' }, ...init,
    })) as unknown as typeof globalThis.fetch,
  })

describe('le secours n’existe que s’il est configuré', () => {
  it('sans clé, il se déclare indisponible plutôt que d’échouer à l’usage', () => {
    expect(fournisseurOpenRouter({ cle: undefined as unknown as string }).disponible).toBe(false)
  })

  it('avec une clé, il est disponible', () => {
    expect(fournisseurOpenRouter({ cle: 'EXAMPLE-inert-no-value' }).disponible).toBe(true)
  })
})

describe('les échecs sont catégorisés comme il faut', () => {
  it.each([
    [402, 'panne'],
    [429, 'panne'],
    [503, 'panne'],
    [401, 'auth'],
    [400, 'demande-invalide'],
  ] as const)('un %i devient « %s »', async (status, categorie) => {
    await expect(avec({ status }, {}).completer(demande)).rejects.toMatchObject({ categorie })
  })

  it('une erreur dans le CORPS, avec HTTP 200, est vue quand même', async () => {
    // OpenRouter renvoie parfois 200 avec un objet d'erreur : lire seulement
    // le statut ferait passer une panne pour une réponse vide.
    await expect(
      avec({ status: 200 }, { error: { message: 'crédit épuisé', code: 402 } }).completer(demande),
    ).rejects.toMatchObject({ categorie: 'panne' })
  })

  it('une réponse illisible est une panne, pas un texte vide', async () => {
    await expect(avec({ status: 200 }, '<html>').completer(demande)).rejects.toMatchObject({ categorie: 'panne' })
  })
})

describe('un refus reste un refus, quel que soit le chemin', () => {
  it('content_filter est rendu comme refus, pas comme réponse vide', async () => {
    const r = await avec({ status: 200 }, {
      model: 'anthropic/claude-opus-4.1',
      choices: [{ message: { content: 'ignoré' }, finish_reason: 'content_filter' }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    }).completer(demande)
    expect(r.refus).toBe(true)
    expect(r.texte, 'le texte d’un refus ne doit pas être exploité').toBe('')
  })

  it('une réponse normale porte ses tokens', async () => {
    const r = await avec({ status: 200 }, {
      model: 'anthropic/claude-opus-4.1',
      choices: [{ message: { content: 'Dakar' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 38, completion_tokens: 6 },
    }).completer(demande)
    expect(r).toMatchObject({ texte: 'Dakar', refus: false, tokensEntree: 38, tokensSortie: 6 })
  })
})

describe('le paquet doit être importable par le WORKER, pas seulement par vitest', () => {
  it('Node le charge sans bundler', async () => {
    // Le web tolère les imports sans extension, Node non — et c'est le worker
    // qui exécute ce code. Sans ce test, la régression n'apparaîtrait qu'au
    // DÉMARRAGE en production, jamais au typecheck ni en test unitaire.
    const racine = join(import.meta.dirname, '..', '..', '..')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-e',
       `import('${join(racine, 'packages/llm/src/index.ts')}').then(m => console.log(typeof m.creerBascule))`],
      { cwd: racine },
    )
    expect(stdout.trim()).toBe('function')
  }, 30_000)
})
