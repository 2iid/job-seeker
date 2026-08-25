import { describe, expect, it } from 'vitest'
import { EnvError, readEnv, redact } from './index.js'

/**
 * Les valeurs ci-dessous portent le marqueur `EXAMPLE` et n'ont ni préfixe de
 * fournisseur, ni entropie.
 *
 * Ce n'est pas cosmétique : le scan de secrets de `.githooks/pre-commit` refuse
 * tout littéral en forme de justificatif et filtre explicitement les lignes
 * contenant EXAMPLE / PLACEHOLDER / CHANGEME. Une fixture « plus réaliste »
 * fait refuser le commit — et le scan a raison, il ne peut pas savoir qu'elle
 * est fausse. Ne les « améliorez » pas.
 */
const complete = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3100',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'EXAMPLE-inert-no-value',
  SUPABASE_SERVICE_ROLE_KEY: 'EXAMPLE-inert-no-value',
  ANTHROPIC_API_KEY: 'EXAMPLE-inert-no-value',
}

describe('readEnv', () => {
  it('accepte un environnement complet', () => {
    expect(readEnv('web', complete).APP_URL).toBe('http://localhost:3100')
  })

  it('échoue en nommant la variable manquante', () => {
    const { APP_URL: _omitted, ...without } = complete
    expect(() => readEnv('web', without)).toThrowError(/APP_URL is missing/)
  })

  it('traite une chaîne vide comme manquante — pas comme une valeur', () => {
    expect(() => readEnv('web', { ...complete, APP_URL: '   ' })).toThrowError(/APP_URL is missing/)
  })

  it('rapporte TOUS les problèmes, pas seulement le premier', () => {
    try {
      readEnv('worker', { NODE_ENV: 'test' })
      expect.unreachable('aurait dû lever')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError)
      expect((error as EnvError).problems).toHaveLength(3)
    }
  })

  it('valide la forme, pas seulement la présence', () => {
    expect(() => readEnv('web', { ...complete, SUPABASE_URL: 'pas-une-url' })).toThrowError(
      /SUPABASE_URL must be a valid URL/,
    )
  })

  it("n'exige d'un runtime que ce dont il a besoin", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _s, ANTHROPIC_API_KEY: _a, ...webOnly } = complete
    expect(() => readEnv('web', webOnly)).not.toThrow()
  })

  it('ne renvoie jamais une variable non déclarée', () => {
    expect(readEnv('web', { ...complete, TOTALLY_UNKNOWN: 'x' })).not.toHaveProperty('TOTALLY_UNKNOWN')
  })
})

describe('redact', () => {
  it('masque un secret', () => {
    expect(redact('ANTHROPIC_API_KEY', 'EXAMPLE-inert-no-value')).toBe('EXA***ue')
  })

  it('laisse passer ce qui est public', () => {
    expect(redact('APP_URL', 'http://localhost:3100')).toBe('http://localhost:3100')
  })

  it('ne laisse jamais fuir un secret court', () => {
    expect(redact('ANTHROPIC_API_KEY', 'bref')).toBe('***')
  })
})
