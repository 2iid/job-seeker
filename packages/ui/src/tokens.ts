/**
 * Les tokens de « La Cabine », transcrits depuis docs/design/design-system.md.
 *
 * Ce fichier est la source unique : `tokens.css` en est engendré, et les tests
 * de parité et de contraste s'exécutent contre lui. Une valeur littérale écrite
 * ailleurs dans le produit est un défaut de revue, pas une préférence.
 *
 * La règle qui structure tout : **chaque rôle porte une valeur dans les DEUX
 * thèmes**. Aucun rôle ne peut exister d'un seul côté — c'est vérifié par un
 * test, pas promis par une phrase.
 */

export type Theme = 'dark' | 'light'

/** Un rôle et ce à quoi il sert. La description n'est pas décorative : elle est
 *  ce qui empêche un token d'être réemployé pour autre chose six mois plus tard. */
export type TokenRole = {
  readonly dark: string
  readonly light: string
  readonly usage: string
}

export const TOKENS = {
  // ── surfaces ────────────────────────────────────────────────────────────
  'surface-page': {
    dark: '#111218', light: '#F1F2F7',
    usage: "Le vide entre les modules. Jamais blanc pur en clair : le filet de 1 px doit rester visible.",
  },
  'surface-module': {
    dark: '#1C1E25', light: '#FFFFFF',
    usage: 'Le module lui-même. Dans les deux thèmes, le contenu est plus clair que la page.',
  },
  'surface-chrome': {
    dark: '#181920', light: '#F8F9FC',
    usage: "En-tête d'écran, barre d'action fixe, pied de module.",
  },
  'surface-sunken': {
    dark: '#0B0C11', light: '#E9EBF1',
    usage: 'Champ de saisie, squelette de chargement, zone de citation.',
  },
  'surface-colonne-active': {
    dark: '#161720', light: '#F4F5F9',
    usage: "Colonne de kanban demandant une action. Teinte EN PLUS du libellé et de la forme, jamais à leur place.",
  },

  // ── traits ──────────────────────────────────────────────────────────────
  'border-module': {
    dark: '#373942', light: '#D2D4DC',
    usage: 'Structure seule. Sous 3:1 — jamais seule frontière d’un contrôle ni seul porteur d’information.',
  },
  'rule-inner': {
    dark: '#2A2C34', light: '#E9EBF1',
    usage: 'Filet à l’intérieur d’un module. Structure seule.',
  },
  'border-control': {
    // Le sombre a été remonté de #60636F à #6B6E7A par le test de contraste :
    // l'ancienne valeur tenait 3,13:1 contre --surface-page mais seulement
    // 2,78:1 contre --surface-module — c'est-à-dire SOUS le minimum WCAG de
    // 3:1, précisément là où les contrôles vivent réellement. Le document
    // annonçait la mesure contre la page. Personne ne l'aurait vu à l'œil.
    dark: '#6B6E7A', light: '#888B99',
    usage: 'Bordure de bouton, champ, bascule. Doit tenir 3:1 sur --surface-module dans les deux thèmes.',
  },

  // ── texte ───────────────────────────────────────────────────────────────
  'text-primary': {
    dark: '#EBECF2', light: '#1B1D28',
    usage: "Titres, phrases de l'agent, valeurs.",
  },
  'text-secondary': {
    dark: '#BABCC4', light: '#4D4F5A',
    usage: 'Entreprise, lieu, sous-titre de ligne.',
  },
  'text-muted': {
    dark: '#9799A1', light: '#666872',
    usage: "Libellés de colonne, horodatage. Tenu au-dessus de 4,5:1 — rien de lisible n'est « gris décoratif ».",
  },
  'text-on-fill': {
    dark: '#0D0E13', light: '#FDFDFF',
    usage: "Texte sur aplat d'accent. Mesuré sur --accent-attente, le pire cas des trois.",
  },

  // ── accents ─────────────────────────────────────────────────────────────
  'accent-machine': {
    dark: '#59C2D4', light: '#006B7E',
    usage: 'CE QUE LA MACHINE A FAIT. Teinte conservée (H 210), clarté descendue de 0,760 à 0,470 pour le clair.',
  },
  'accent-attente': {
    dark: '#E4AF6C', light: '#804E00',
    usage: "CE QUI ATTEND UN HUMAIN. File d'approbation, escalade. Jamais employé pour la fraîcheur.",
  },
  'accent-critique': {
    dark: '#E88F87', light: '#983432',
    usage: "Échec technique, suppression, arrêt. Par ÉVÉNEMENT, jamais en permanence.",
  },

  // ── focus ───────────────────────────────────────────────────────────────
  'focus-ring': {
    dark: '#86E2F2', light: '#006B7E',
    usage: "Trait de 2 px + décalage de 2 px. Jamais `outline: none` sans remplacement visible.",
  },
} as const satisfies Record<string, TokenRole>

export type TokenName = keyof typeof TOKENS

/** Les rôles dont le contraste est mesuré, et contre quelle surface. */
export const CONTRAST_CONTRACT = [
  { token: 'text-primary', against: 'surface-module', min: 4.5, why: 'corps de texte' },
  { token: 'text-secondary', against: 'surface-module', min: 4.5, why: 'corps secondaire' },
  { token: 'text-muted', against: 'surface-module', min: 4.5, why: 'horodatage, libellé de colonne' },
  { token: 'accent-machine', against: 'surface-module', min: 4.5, why: 'ce que la machine a fait' },
  { token: 'accent-attente', against: 'surface-module', min: 4.5, why: 'ce qui attend un humain' },
  { token: 'accent-critique', against: 'surface-module', min: 4.5, why: 'échec technique' },
  { token: 'border-control', against: 'surface-module', min: 3, why: 'partie non textuelle d’un contrôle' },
  { token: 'focus-ring', against: 'surface-module', min: 3, why: 'anneau de focus' },
  { token: 'text-on-fill', against: 'accent-attente', min: 4.5, why: 'texte sur aplat, pire cas' },
] as const satisfies readonly { token: TokenName; against: TokenName; min: number; why: string }[]

// ── espacement, rayons, durées ────────────────────────────────────────────
export const SPACE = [4, 8, 12, 16, 22, 30, 44, 64] as const
export const RADIUS = { module: 0, control: 3, pill: 6 } as const
export const DURATION = { toggle: 120, state: 180, panel: 260 } as const
/** 44 px de côté, 8 px d'écart réel, 52 px pour une ligne de tableau tactile. */
export const TOUCH = { min: 44, gap: 8, row: 52 } as const

// ── contraste : mesuré, jamais estimé ─────────────────────────────────────

export function parseHex(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (m?.[1] === undefined) throw new Error(`couleur non hexadécimale à 6 chiffres : ${hex}`)
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminance relative, WCAG 2.1 §relative-luminance. */
export function luminance(hex: string): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Rapport de contraste WCAG 2.1, arrondi au centième. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

export function value(name: TokenName, theme: Theme): string {
  return TOKENS[name][theme]
}
