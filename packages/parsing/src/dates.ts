/**
 * Une date de CV n'a pas toujours un jour, et prétendre le contraire ment.
 *
 * Un CV écrit « 2021 », « mars 2019 », parfois « 12/03/2019 ». La colonne, elle,
 * veut une `date`. La conversion naïve — « 2021 » devient le 1er janvier 2021 —
 * est silencieuse et irréversible : l'écran affichera ensuite « 1 janvier 2021 »
 * à quelqu'un qui n'a jamais écrit ça, et personne ne pourra distinguer la date
 * qu'il a donnée de celle qu'on a inventée pour lui.
 *
 * On garde donc la date ET sa PRÉCISION. Le 1er janvier reste le point d'ancrage
 * — il faut bien trier — mais il est marqué comme une approximation d'année, et
 * l'affichage rend « 2021 ». La précision est ce qui rend la conversion
 * réversible.
 */

export type Precision = 'jour' | 'mois' | 'annee'

export type DateCv = { readonly iso: string; readonly precision: Precision }

const MOIS: Readonly<Record<string, number>> = {
  janvier: 1, janv: 1, january: 1, jan: 1,
  fevrier: 2, fevr: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, september: 9, sep: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
}

const sansAccents = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const deuxChiffres = (n: number): string => String(n).padStart(2, '0')

/**
 * Lit ce qu'un CV a écrit, ou rend `null`.
 *
 * `null` n'est pas un échec à cacher : c'est ce qui fera marquer le champ « à
 * vérifier » sur l'écran de relecture. Deviner ici transformerait une lecture
 * ratée en une date fausse que personne ne relira.
 */
export function lireDate(brut: string): DateCv | null {
  const t = sansAccents(brut).trim()
  if (t === '') return null
  // « aujourd'hui », « en cours », « present » : ce n'est pas une date, c'est
  // une absence de fin — et c'est au champ `fin` de la porter comme null.
  //
  // Le refus vaut aussi quand une année traîne dans la même chaîne, cas d'une
  // plage entière rangée dans le champ DÉBUT (« 2021 — aujourd'hui »). En
  // extraire « 2021 » serait probablement juste, et c'est là le problème :
  // « probablement juste » enregistré en silence est ce que ce module existe
  // pour empêcher. Un null fait marquer le champ « à vérifier ».
  if (/\b(aujourd|en cours|present|current|now)\b/.test(t)) return null

  const jms = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t)
  if (jms !== null) {
    return { iso: `${jms[3]}-${deuxChiffres(Number(jms[2]))}-${deuxChiffres(Number(jms[1]))}`, precision: 'jour' }
  }

  const isoJour = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  if (isoJour !== null) return { iso: `${isoJour[1]}-${isoJour[2]}-${isoJour[3]}`, precision: 'jour' }

  const isoMois = /\b(\d{4})-(\d{2})\b/.exec(t)
  if (isoMois !== null) return { iso: `${isoMois[1]}-${isoMois[2]}-01`, precision: 'mois' }

  const nomMois = /\b([a-z]{3,10})\.?\s+(\d{4})\b/.exec(t)
  if (nomMois !== null) {
    const m = MOIS[nomMois[1] as string]
    if (m !== undefined) return { iso: `${nomMois[2]}-${deuxChiffres(m)}-01`, precision: 'mois' }
  }

  const moisNom = /\b(\d{2})[/.-](\d{4})\b/.exec(t)
  if (moisNom !== null) {
    return { iso: `${moisNom[2]}-${deuxChiffres(Number(moisNom[1]))}-01`, precision: 'mois' }
  }

  const annee = /\b(19\d{2}|20\d{2})\b/.exec(t)
  if (annee !== null) return { iso: `${annee[1]}-01-01`, precision: 'annee' }

  return null
}

const NOMS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** Rend la date comme le CV l'a écrite, jamais plus précise qu'elle ne l'était. */
export function afficherDate(d: DateCv, locale: 'fr' | 'en' = 'fr'): string {
  const [a, m, j] = d.iso.split('-') as [string, string, string]
  if (d.precision === 'annee') return a
  if (d.precision === 'mois') {
    const nom = locale === 'fr' ? NOMS_FR[Number(m) - 1] : new Date(`${d.iso}T12:00:00Z`).toLocaleString('en', { month: 'long', timeZone: 'UTC' })
    return `${nom} ${a}`
  }
  return locale === 'fr' ? `${Number(j)} ${NOMS_FR[Number(m) - 1]} ${a}` : `${a}-${m}-${j}`
}
