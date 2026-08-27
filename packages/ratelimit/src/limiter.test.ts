import { describe, expect, it, vi } from 'vitest'
import { empreinte } from './empreinte.ts'
import { limiter, type Cle, type Compteur } from './limiter.ts'
import { POLITIQUES } from './politique.ts'
import { MESSAGE_UNIFORME, reponseTropDeRequetes } from './reponse.ts'

const SEL = 'sel-de-test-suffisamment-long'
const ok = (compte: number): Awaited<ReturnType<Compteur>> => ({
  compte,
  finFenetre: new Date(Date.now() + 60_000),
  autorise: true,
})
const refus = (): Awaited<ReturnType<Compteur>> => ({
  compte: 99,
  finFenetre: new Date(Date.now() + 42_000),
  autorise: false,
})

describe('empreinte', () => {
  it('ne laisse jamais transparaître la valeur', () => {
    const e = empreinte('auth-lien-adresse', 'candidate@exemple.fr', SEL)
    expect(e).not.toContain('candidate')
    expect(e).not.toContain('exemple')
    expect(e).toMatch(/^[0-9a-f]{64}$/)
  })

  it('normalise la casse et les espaces — sinon la limite se contourne à la touche Maj', () => {
    expect(empreinte('p', '  Candidate@Exemple.FR ', SEL)).toBe(
      empreinte('p', 'candidate@exemple.fr', SEL),
    )
  })

  it('sépare les portées : le quota de connexion n’est pas celui du modèle', () => {
    expect(empreinte('a', 'x@y.fr', SEL)).not.toBe(empreinte('b', 'x@y.fr', SEL))
  })

  it('change entièrement avec le sel — une table volée sans le sel ne se retourne pas', () => {
    expect(empreinte('p', 'x@y.fr', SEL)).not.toBe(empreinte('p', 'x@y.fr', `${SEL}-autre`))
  })

  it('REFUSE sans sel au lieu de se rabattre sur un condensat nu', () => {
    // Le repli silencieux est le vrai danger : la limitation continuerait de
    // compter juste, et rien ne dirait que la table est devenue lisible.
    expect(() => empreinte('p', 'x@y.fr', '')).toThrow(/LIMITATION_SEL/)
    expect(() => empreinte('p', 'x@y.fr', 'court')).toThrow(/16 caractères/)
  })
})

describe('limiter — l’ordre est une décision de sécurité', () => {
  const cles: Cle[] = [
    { politique: POLITIQUES['auth-lien-ip'], valeur: '203.0.113.7' },
    { politique: POLITIQUES['auth-lien-adresse'], valeur: 'victime@exemple.fr' },
  ]

  it('laisse passer quand toutes les clés passent, et consomme chacune une fois', async () => {
    const compteur = vi.fn<Compteur>().mockResolvedValue(ok(1))
    await expect(limiter(cles, compteur, SEL)).resolves.toEqual({ autorise: true })
    expect(compteur).toHaveBeenCalledTimes(2)
  })

  it('un refus sur l’IP ne consomme PAS le jeton de l’adresse', async () => {
    // Sans ce court-circuit, une seule source épuise les quotas de mille
    // personnes : la protection de la boîte devient le moyen de bloquer la
    // connexion de quelqu’un de précis.
    const compteur = vi.fn<Compteur>().mockResolvedValue(refus())
    const v = await limiter(cles, compteur, SEL)
    expect(v.autorise).toBe(false)
    expect(compteur).toHaveBeenCalledTimes(1)
  })

  it('rend une durée de reprise strictement positive', async () => {
    const compteur = vi.fn<Compteur>().mockResolvedValue(refus())
    const v = await limiter(cles, compteur, SEL)
    expect(v.autorise).toBe(false)
    if (!v.autorise) {
      expect(v.reessayerDans).toBeGreaterThan(0)
      expect(v.reessayerDans).toBeLessThanOrEqual(43)
      expect(v.parPanne).toBe(false)
    }
  })
})

describe('limiter — magasin injoignable', () => {
  it('REFUSE sur une politique « refuser » : une dépense ne se rattrape pas', async () => {
    const compteur = vi.fn<Compteur>().mockRejectedValue(new Error('ECONNREFUSED'))
    const v = await limiter(
      [{ politique: POLITIQUES['analyse-modele'], valeur: 'u1' }],
      compteur,
      SEL,
    )
    expect(v.autorise).toBe(false)
    if (!v.autorise) expect(v.parPanne).toBe(true)
  })

  it('laisse passer sur une politique « laisser-passer »', async () => {
    const compteur = vi.fn<Compteur>().mockRejectedValue(new Error('ECONNREFUSED'))
    const v = await limiter(
      [
        {
          politique: { portee: 'lecture', fenetreSecondes: 60, plafond: 5, siIndisponible: 'laisser-passer' },
          valeur: 'u1',
        },
      ],
      compteur,
      SEL,
    )
    expect(v).toEqual({ autorise: true })
  })

  it('toutes les politiques déclarées aujourd’hui refusent — elles coûtent ou elles sortent', () => {
    for (const p of Object.values(POLITIQUES)) expect(p.siIndisponible).toBe('refuser')
  })
})

describe('réponse 429 — elle ne doit rien apprendre à personne', () => {
  it('ne nomme jamais la portée qui a refusé', async () => {
    const r = reponseTropDeRequetes({
      autorise: false,
      portee: 'auth-lien-adresse',
      reessayerDans: 42,
      parPanne: false,
    })
    const corps = await r.text()
    expect(r.status).toBe(429)
    expect(corps).toBe(JSON.stringify({ erreur: MESSAGE_UNIFORME }))
    expect(corps).not.toContain('adresse')
    expect(corps).not.toContain('ip')
  })

  it('est identique qu’il s’agisse d’un dépassement ou d’une panne', async () => {
    const base = { autorise: false as const, portee: 'auth-lien-ip', reessayerDans: 30 }
    const a = await reponseTropDeRequetes({ ...base, parPanne: false }).text()
    const b = await reponseTropDeRequetes({ ...base, parPanne: true }).text()
    expect(a).toBe(b)
  })

  it('porte Retry-After et interdit la mise en cache partagée', () => {
    const r = reponseTropDeRequetes({
      autorise: false,
      portee: 'auth-lien-ip',
      reessayerDans: 42,
      parPanne: false,
    })
    expect(r.headers.get('retry-after')).toBe('42')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
})
