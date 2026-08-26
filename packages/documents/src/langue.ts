/**
 * JOB-044 — dans quelle langue écrire, et quand s'arrêter pour le demander.
 *
 * REQ-008 : « les documents sont rédigés dans la langue de l'offre, détectée
 * automatiquement et corrigeable en un geste. **Si la langue détectée n'est pas
 * maîtrisée d'après le profil, le produit le signale avant envoi** plutôt que
 * de produire un texte que le candidat ne pourra pas défendre en entretien. »
 *
 * La seconde phrase est la fonctionnalité. Un modèle écrit un néerlandais
 * irréprochable en trois secondes ; le candidat qui l'envoie sera rappelé en
 * néerlandais, et ce jour-là le produit lui aura nui. Écrire dans une langue
 * qu'on ne parle pas n'est pas un service rendu — c'est un piège posé avec
 * beaucoup de soin.
 *
 * ── La détection est volontairement grossière ──
 *
 * On ne cherche pas à distinguer le portugais du brésilien : on cherche à
 * savoir s'il faut écrire en français, en anglais, ou s'ARRÊTER. Les mots
 * comptés sont des mots-outils — articles, prépositions, auxiliaires — parce
 * qu'ils sont fréquents, courts, et propres à une langue, là où le vocabulaire
 * technique d'une annonce est anglais partout.
 */

export type Langue = 'fr' | 'en' | 'es' | 'de' | 'nl' | 'it' | 'pt' | 'inconnue'

/**
 * Mots-outils, par langue. Chacun doit être fréquent DANS les annonces et rare
 * dans les autres langues de la liste : « de » est français, néerlandais ET
 * portugais, donc il n'y figure pour aucune.
 */
const OUTILS: Readonly<Record<Exclude<Langue, 'inconnue'>, readonly string[]>> = {
  fr: ['vous', 'nous', 'votre', 'notre', 'chez', 'avec', 'pour', 'dans', 'sera', 'sont', 'poste', 'entreprise'],
  en: ['you', 'your', 'we', 'our', 'with', 'the', 'and', 'will', 'role', 'team', 'about', 'position'],
  es: ['usted', 'nuestro', 'nuestra', 'con', 'para', 'sobre', 'puesto', 'empresa', 'equipo', 'buscamos'],
  de: ['sie', 'ihre', 'wir', 'unser', 'mit', 'für', 'bei', 'und', 'stelle', 'unternehmen', 'team'],
  nl: ['jij', 'jouw', 'wij', 'ons', 'met', 'voor', 'bij', 'functie', 'bedrijf', 'zoeken'],
  it: ['tu', 'tuo', 'noi', 'nostro', 'con', 'per', 'presso', 'azienda', 'ruolo', 'cerchiamo'],
  pt: ['você', 'seu', 'nosso', 'com', 'para', 'sobre', 'vaga', 'empresa', 'equipe', 'procuramos'],
}

export type Detection = {
  readonly langue: Langue
  /** Part des mots-outils reconnus qui appartiennent à la langue retenue. */
  readonly confiance: number
}

/**
 * Sous ce seuil, on rend `inconnue` plutôt qu'un pari.
 *
 * Se tromper de langue ne produit pas un texte médiocre : il produit une
 * lettre en espagnol pour une offre italienne, ce qui est pire qu'une lettre
 * en anglais. Dire « je ne sais pas » renvoie à l'utilisateur un choix d'un
 * geste ; deviner lui renvoie un document à jeter.
 */
const SEUIL = 0.4

export function detecterLangue(texte: string): Detection {
  const mots = texte
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}]+/u)
    .filter((m) => m.length > 1)

  if (mots.length < 12) return { langue: 'inconnue', confiance: 0 }

  const comptes = new Map<Langue, number>()
  let total = 0
  for (const m of mots) {
    for (const [langue, outils] of Object.entries(OUTILS) as [Exclude<Langue, 'inconnue'>, readonly string[]][]) {
      if (outils.includes(m)) {
        comptes.set(langue, (comptes.get(langue) ?? 0) + 1)
        total += 1
      }
    }
  }
  if (total === 0) return { langue: 'inconnue', confiance: 0 }

  const [meilleure, n] = [...comptes].sort((a, b) => b[1] - a[1])[0]!
  const confiance = n / total
  return confiance >= SEUIL ? { langue: meilleure, confiance } : { langue: 'inconnue', confiance }
}

/**
 * La personne peut-elle défendre un document dans cette langue ?
 *
 * Comparaison indulgente : le profil dit « anglais (courant) », « English »,
 * « Anglais B2 ». Exiger un code ISO écarterait la quasi-totalité des profils
 * réels et déclencherait l'alerte pour tout le monde — une alerte qui se
 * déclenche toujours n'alerte plus.
 */
export const NOMS_LANGUES: Readonly<Record<Exclude<Langue, 'inconnue'>, readonly string[]>> = {
  fr: ['fr', 'francais', 'french'],
  en: ['en', 'anglais', 'english'],
  es: ['es', 'espagnol', 'spanish', 'espanol', 'castellano'],
  de: ['de', 'allemand', 'german', 'deutsch'],
  nl: ['nl', 'neerlandais', 'dutch', 'nederlands'],
  it: ['it', 'italien', 'italian', 'italiano'],
  pt: ['pt', 'portugais', 'portuguese', 'portugues'],
}

const sansAccent = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function maitrise(langue: Langue, languesDuProfil: readonly string[]): boolean {
  if (langue === 'inconnue') return false
  const noms = NOMS_LANGUES[langue]
  return languesDuProfil.some((l) => {
    const n = sansAccent(l)
    return noms.some((nom) => n.includes(nom))
  })
}

export type VerdictLangue =
  | { readonly ecrire: true; readonly langue: Langue }
  | {
      readonly ecrire: false
      readonly motif: 'langue-inconnue' | 'langue-non-maitrisee'
      readonly langue: Langue
      readonly explication: string
    }

const LIBELLE: Readonly<Record<Exclude<Langue, 'inconnue'>, string>> = {
  fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand',
  nl: 'néerlandais', it: 'italien', pt: 'portugais',
}

/**
 * Décide s'il faut écrire, et sinon pourquoi.
 *
 * Ne rend JAMAIS un repli silencieux vers l'anglais. Écrire en anglais une
 * lettre destinée à une annonce néerlandaise est un choix qui appartient à la
 * personne — il dit quelque chose d'elle au recruteur, et ce n'est pas à nous
 * de le dire à sa place.
 */
export function choisirLangue(
  texteOffre: string,
  languesDuProfil: readonly string[],
): VerdictLangue {
  const d = detecterLangue(texteOffre)
  if (d.langue === 'inconnue') {
    return {
      ecrire: false,
      motif: 'langue-inconnue',
      langue: 'inconnue',
      explication:
        'Je n’arrive pas à déterminer la langue de cette annonce avec assez de certitude. Dites-la-moi ' +
        'et j’écris — me tromper de langue produirait un document à jeter.',
    }
  }
  if (!maitrise(d.langue, languesDuProfil)) {
    return {
      ecrire: false,
      motif: 'langue-non-maitrisee',
      langue: d.langue,
      explication:
        `Cette annonce est en ${LIBELLE[d.langue]}, et votre profil ne mentionne pas cette langue. ` +
        'Je sais écrire la lettre ; vous seriez rappelé dans cette langue. Ajoutez-la à votre profil ' +
        'si vous la parlez, ou dites-moi d’écrire dans une autre.',
    }
  }
  return { ecrire: true, langue: d.langue }
}
