import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES, traduire } from '@job-seeker/i18n'
import { CONTRAST_CONTRACT, TOKENS, contrast, luminance, parseHex, value } from './tokens'
import { STATUSES, TIERS } from './status'
import { renderCss } from '../scripts/build-css.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const names = Object.keys(TOKENS) as (keyof typeof TOKENS)[]

describe('parité des thèmes', () => {
  it('chaque rôle porte une valeur dans les DEUX thèmes', () => {
    for (const n of names) {
      expect(TOKENS[n].dark, `${n}.dark`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(TOKENS[n].light, `${n}.light`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('aucun rôle n’a la même valeur dans les deux thèmes', () => {
    // Un token identique des deux côtés est presque toujours un oubli de
    // conception : il n'a pas été pensé pour l'un des deux fonds.
    for (const n of names) {
      expect(TOKENS[n].dark.toLowerCase(), `${n} est identique en clair et en sombre`)
        .not.toBe(TOKENS[n].light.toLowerCase())
    }
  })

  it('le sombre est réellement sombre et le clair réellement clair', () => {
    expect(luminance(value('surface-page', 'dark'))).toBeLessThan(0.1)
    expect(luminance(value('surface-page', 'light'))).toBeGreaterThan(0.8)
  })

  it('chaque rôle documente son emploi', () => {
    for (const n of names) expect(TOKENS[n].usage.length, `${n}.usage`).toBeGreaterThan(20)
  })

  it('aucun token n’est nommé par sa valeur', () => {
    // --blue-500 est un nom qui interdit de changer d'avis. Les noms disent le
    // RÔLE ; c'est ce qui permet au clair et au sombre d'être le même système.
    const parValeur = /(blue|red|green|yellow|orange|purple|grey|gray|teal|amber|[0-9]{3})/i
    for (const n of names) expect(n, `${n} est nommé par sa valeur`).not.toMatch(parValeur)
  })
})

describe('contraste — mesuré, jamais estimé', () => {
  it.each(CONTRAST_CONTRACT)(
    '$token sur $against tient $min:1 dans les deux thèmes ($why)',
    ({ token, against, min }) => {
      for (const theme of ['dark', 'light'] as const) {
        const ratio = contrast(value(token, theme), value(against, theme))
        expect(ratio, `${token}/${against} en ${theme} = ${ratio}:1`).toBeGreaterThanOrEqual(min)
      }
    },
  )

  it('les ratios ÉCRITS dans docs/design/design-system.md sont ceux qu’on mesure', () => {
    // Le test ne compare pas à des chiffres recopiés ici : il LIT le tableau du
    // document. Un document qui ment sur l'accessibilité est pire que pas de
    // document — celui-ci ne peut plus mentir sans casser la suite.
    const doc = readFileSync(join(HERE, '../../../docs/design/design-system.md'), 'utf8')
    const ligne = /^\|\s*`--([a-z-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|(.*)$/gm

    const documentes = new Set<string>()
    for (const m of doc.matchAll(ligne)) {
      const [, nom, hexDark, hexLight, reste] = m as unknown as string[]
      const token = nom as keyof typeof TOKENS
      if (TOKENS[token] === undefined) continue

      // Les valeurs du document sont celles du code, à la casse près.
      expect(hexDark?.toLowerCase(), `${nom}: hex sombre`).toBe(TOKENS[token].dark.toLowerCase())
      expect(hexLight?.toLowerCase(), `${nom}: hex clair`).toBe(TOKENS[token].light.toLowerCase())

      const ratios = /\*\*(\d+,\d+)\s*\/\s*(\d+,\d+)\*\*/.exec(reste ?? '')
      if (ratios === null) continue
      const contre = token === 'text-on-fill' ? 'accent-attente' : 'surface-module'
      const annonce = {
        dark: Number((ratios[1] ?? '').replace(',', '.')),
        light: Number((ratios[2] ?? '').replace(',', '.')),
      }
      for (const theme of ['dark', 'light'] as const) {
        const reel = contrast(value(token, theme), value(contre, theme))
        expect(
          Math.abs(reel - annonce[theme]),
          `${nom} en ${theme} : le document annonce ${annonce[theme]}, la mesure donne ${reel}`,
        ).toBeLessThan(0.06)
      }
      documentes.add(nom ?? '')
    }
    // Un document dont on ne lit plus aucune ligne passerait ce test en silence.
    // Le garde-fou n'est donc pas un compte, c'est une couverture : tout rôle
    // dont le contraste est contractuel doit être écrit quelque part.
    const manquants = CONTRAST_CONTRACT.map((c) => c.token).filter((n) => !documentes.has(n))
    expect(manquants, 'rôle(s) du contrat de contraste absent(s) du document').toEqual([])
  })

  it('le calcul suit bien WCAG 2.1 sur les bornes connues', () => {
    expect(contrast('#000000', '#FFFFFF')).toBe(21)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1)
    expect(parseHex('#59C2D4')).toEqual([0x59, 0xc2, 0xd4])
    expect(() => parseHex('rouge')).toThrowError(/hexadécimale/)
  })
})

describe('langage de statut — jamais la couleur seule', () => {
  const statuts = Object.values(STATUSES)

  // Les libellés vivent désormais dans `@job-seeker/i18n` : ces vérifications
  // portent donc sur les DEUX langues. Ce n'est pas un rattrapage, c'est un
  // renforcement — « ce n'est pas votre échec » n'a aucune valeur si la version
  // anglaise dit « you failed ».
  const dans = (locale: 'fr' | 'en') =>
    statuts.map((s) => ({
      shape: s.shape,
      label: traduire(s.labelKey, locale),
      meaning: traduire(s.meaningKey, locale),
    }))

  it.each(LOCALES)('%s : chaque statut porte une forme, un libellé et un sens', (locale) => {
    for (const s of dans(locale)) {
      expect(s.shape).toBeTruthy()
      expect(s.label.length).toBeGreaterThan(2)
      expect(s.meaning.length).toBeGreaterThan(15)
    }
  })

  it('les formes sont toutes distinctes — retirez la couleur, le sens reste', () => {
    const formes = statuts.map((s) => s.shape)
    expect(new Set(formes).size, 'deux statuts partagent une forme').toBe(formes.length)
  })

  it.each(LOCALES)('%s : aucun libellé ne rejette la faute sur le candidat', (locale) => {
    const blessant =
      /(échec de votre|vous avez échoué|rejeté|raté|perdu|you failed|your failure|rejected|you lost)/i
    for (const s of dans(locale)) {
      expect(s.label, s.label).not.toMatch(blessant)
      expect(s.meaning, s.meaning).not.toMatch(blessant)
    }
  })

  it('aucun statut n’emploie l’accent d’attente pour de la fraîcheur', () => {
    // --accent-attente veut dire « un humain doit agir ». L'employer ailleurs
    // dilue le seul signal qui doit rester rare.
    for (const t of Object.values(TIERS)) expect(t.tone).not.toBe('accent-attente')
  })

  it('le palier C ne promet jamais de candidature, dans aucune langue', () => {
    expect(traduire(TIERS.c.promiseKey, 'fr')).toMatch(/je ne postule pas/i)
    expect(traduire(TIERS.c.promiseKey, 'en')).toMatch(/don.t apply/i)
    expect(TIERS.a.bars).toBeGreaterThan(TIERS.b.bars)
    expect(TIERS.b.bars).toBeGreaterThan(TIERS.c.bars)
  })

  it('aucun palier ne promet un RANG chiffré', () => {
    // « 3ᵉ candidat » est une information que nous n'avons pas. Le palier A
    // promet « parmi les premiers », jamais un numéro.
    for (const locale of LOCALES) {
      for (const t of Object.values(TIERS)) {
        expect(traduire(t.promiseKey, locale)).not.toMatch(/\b\d+(e|er|ère|st|nd|rd|th)\b/i)
      }
    }
  })
})

describe('la feuille engendrée ne dérive pas', () => {
  it('tokens.css correspond exactement à tokens.ts', () => {
    const sur_disque = readFileSync(join(HERE, '..', 'tokens', 'tokens.css'), 'utf8')
    expect(sur_disque, 'lancez: node --experimental-strip-types packages/ui/scripts/build-css.ts')
      .toBe(renderCss())
  })

  it('les deux thèmes et le choix explicite sont tous présents', () => {
    const css = readFileSync(join(HERE, '..', 'tokens', 'tokens.css'), 'utf8')
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain("[data-theme='dark']")
    expect(css).toContain("[data-theme='light']")
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
})
