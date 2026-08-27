/**
 * JOB-042 / REQ-007 — le CV au format attendu par le marché visé.
 *
 * « Les conventions diffèrent nettement d'un pays à l'autre : présence ou
 * absence de photo, de date de naissance, de nationalité, de situation
 * familiale ; longueur admise ; ordre des rubriques. Une donnée que le marché
 * visé proscrit est OMISE ET NON TRANSMISE, et le produit dit pourquoi. »
 *
 * ── « Omise et non transmise » ──
 *
 * Ces trois mots sont la fonctionnalité. Masquer une photo par une règle de
 * style la laisse dans le fichier ; un PDF dont on a caché une image contient
 * toujours l'image, et une date de naissance retirée de l'affichage reste dans
 * les métadonnées. La donnée doit ne pas ENTRER dans le document.
 *
 * ── Pourquoi ce n'est pas de l'esthétique ──
 *
 * Aux États-Unis et au Canada, un recruteur qui reçoit un CV avec photo et
 * date de naissance peut l'écarter SANS LE LIRE : les garder l'expose à une
 * plainte pour discrimination. Une convention respectée n'améliore pas la
 * présentation — elle évite que le dossier soit jeté avant d'être ouvert.
 *
 * ── Ce que ce fichier N'EST PAS ──
 *
 * Il n'est pas un avis juridique, et il ne prétend pas l'être. Chaque entrée
 * porte sa date de revue et sa nature : `loi` quand un texte l'impose ou
 * l'expose, `usage` quand c'est une convention de marché. Un usage se périme ;
 * l'écrire sans le dater reviendrait à figer en 2026 des habitudes qui bougent.
 */

export type DonneePersonnelle =
  | 'photo'
  | 'date-naissance'
  | 'nationalite'
  | 'situation-familiale'
  | 'genre'

export type Traitement = 'proscrite' | 'inhabituelle' | 'tolere' | 'attendue'

export type Convention = {
  readonly traitement: Traitement
  readonly nature: 'loi' | 'usage'
  readonly pourquoi: string
}

export type Marche = {
  /** Code ISO 3166-1 alpha-2. */
  readonly pays: string
  readonly nom: string
  readonly donnees: Readonly<Partial<Record<DonneePersonnelle, Convention>>>
  /** Longueur admise, en pages. */
  readonly pagesMax: number
  readonly revuLe: string
}

const PROSCRITE_ANTIDISCRIMINATION: Convention = {
  traitement: 'proscrite',
  nature: 'loi',
  pourquoi:
    'Sur ce marché, un recruteur qui reçoit cette information peut écarter le dossier sans le lire : ' +
    'la conserver l’expose à une plainte pour discrimination. La retirer protège votre candidature, ' +
    'pas la sienne.',
}

const USAGE_INHABITUEL: Convention = {
  traitement: 'inhabituelle',
  nature: 'usage',
  pourquoi:
    'Cette information ne figure plus sur les CV de ce marché. La laisser attire l’attention sur ' +
    'elle plutôt que sur votre parcours.',
}

/**
 * Les marchés couverts.
 *
 * La liste est courte et le restera : ajouter un pays sans avoir vérifié ses
 * conventions produirait un formatage confiant et faux. Un pays absent est
 * traité par `PAR_DEFAUT`, qui n'omet rien et le dit.
 */
export const MARCHES: readonly Marche[] = [
  {
    pays: 'US', nom: 'États-Unis', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: PROSCRITE_ANTIDISCRIMINATION,
      'date-naissance': PROSCRITE_ANTIDISCRIMINATION,
      nationalite: PROSCRITE_ANTIDISCRIMINATION,
      'situation-familiale': PROSCRITE_ANTIDISCRIMINATION,
      genre: PROSCRITE_ANTIDISCRIMINATION,
    },
  },
  {
    pays: 'CA', nom: 'Canada', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: PROSCRITE_ANTIDISCRIMINATION,
      'date-naissance': PROSCRITE_ANTIDISCRIMINATION,
      'situation-familiale': PROSCRITE_ANTIDISCRIMINATION,
      genre: PROSCRITE_ANTIDISCRIMINATION,
    },
  },
  {
    pays: 'GB', nom: 'Royaume-Uni', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: PROSCRITE_ANTIDISCRIMINATION,
      'date-naissance': PROSCRITE_ANTIDISCRIMINATION,
      'situation-familiale': USAGE_INHABITUEL,
    },
  },
  {
    pays: 'AU', nom: 'Australie', pagesMax: 3, revuLe: '2026-08-26',
    donnees: { photo: PROSCRITE_ANTIDISCRIMINATION, 'date-naissance': PROSCRITE_ANTIDISCRIMINATION },
  },
  {
    pays: 'FR', nom: 'France', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: {
        traitement: 'tolere', nature: 'usage',
        pourquoi:
          'La photo reste tolérée en France sans y être attendue. Je la garde si vous en avez une, et ' +
          'son absence ne se remarque pas.',
      },
      'situation-familiale': USAGE_INHABITUEL,
      'date-naissance': USAGE_INHABITUEL,
    },
  },
  {
    pays: 'DE', nom: 'Allemagne', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: {
        traitement: 'tolere', nature: 'usage',
        pourquoi:
          'La photo reste courante sur un Lebenslauf, sans être exigée depuis l’AGG. Ni la mettre ni ' +
          'l’omettre ne se remarque.',
      },
      'date-naissance': {
        traitement: 'tolere', nature: 'usage',
        pourquoi:
          'Encore fréquente sur un Lebenslauf allemand, où elle n’attire pas l’attention. Je la garde ; ' +
          'retirez-la si vous préférez, cela ne choquera personne non plus.',
      },
    },
  },
  {
    pays: 'SN', nom: 'Sénégal', pagesMax: 2, revuLe: '2026-08-26',
    donnees: {
      photo: {
        traitement: 'tolere', nature: 'usage',
        pourquoi: 'La photo est courante sur les CV de ce marché et n’y désavantage pas une candidature.',
      },
      'situation-familiale': {
        traitement: 'tolere', nature: 'usage',
        pourquoi:
          'Encore fréquente sur ce marché. Je la garde ; c’est vous qui savez si elle vous sert auprès ' +
          'de cet employeur-là.',
      },
    },
  },
]

/**
 * Le repli pour un pays qu'on n'a pas vérifié.
 *
 * Il n'omet RIEN, et c'est délibéré. Omettre par précaution retirerait une
 * information que le marché attendait peut-être, sans que personne puisse
 * dire pourquoi. Ne rien omettre en le disant laisse la décision à la
 * personne, qui connaît son marché mieux que cette table.
 */
export const PAR_DEFAUT: Marche = {
  pays: '??', nom: 'marché non vérifié', pagesMax: 2, revuLe: '2026-08-26', donnees: {},
}

export function marcheDe(pays: string | null): Marche {
  if (pays === null) return PAR_DEFAUT
  return MARCHES.find((m) => m.pays === pays.toUpperCase()) ?? PAR_DEFAUT
}

export type Omission = {
  readonly donnee: DonneePersonnelle
  readonly pourquoi: string
  readonly nature: 'loi' | 'usage'
}

export type Formatage = {
  readonly marche: Marche
  /** Ce qui a été RETIRÉ du document — pas masqué. */
  readonly omissions: readonly Omission[]
  /** Ce qui reste, après omission. */
  readonly conservees: readonly DonneePersonnelle[]
  /** Vrai quand le marché n'a pas été vérifié : le produit doit le dire. */
  readonly marcheInconnu: boolean
}

/**
 * Décide ce qui entre dans le document, à partir de ce que le profil contient.
 *
 * Seul `proscrite` omet. `inhabituelle` ne retire rien : ce serait décider à
 * la place de quelqu'un sur la foi d'un usage, et un usage se discute. La
 * distinction entre `loi` et `usage` existe pour que l'interface puisse la
 * rendre — « je l'ai retirée » n'est pas la même phrase que « vous pourriez
 * la retirer ».
 */
export function formaterPour(
  pays: string | null,
  presentes: readonly DonneePersonnelle[],
): Formatage {
  const marche = marcheDe(pays)
  const omissions: Omission[] = []
  const conservees: DonneePersonnelle[] = []

  for (const d of presentes) {
    const c = marche.donnees[d]
    if (c !== undefined && c.traitement === 'proscrite') {
      omissions.push({ donnee: d, pourquoi: c.pourquoi, nature: c.nature })
    } else {
      conservees.push(d)
    }
  }

  return { marche, omissions, conservees, marcheInconnu: marche === PAR_DEFAUT }
}

/** Ce que l'interface annonce, en une phrase. */
export function annoncer(f: Formatage): string {
  if (f.marcheInconnu) {
    return (
      'Je n’ai pas vérifié les conventions de CV de ce marché. Je n’ai donc rien retiré — relisez ce ' +
      'que vous envoyez, vous le connaissez mieux que moi.'
    )
  }
  if (f.omissions.length === 0) {
    return `Rien à retirer pour un CV destiné au marché : ${f.marche.nom}.`
  }
  const noms: Record<DonneePersonnelle, string> = {
    photo: 'votre photo',
    'date-naissance': 'votre date de naissance',
    nationalite: 'votre nationalité',
    'situation-familiale': 'votre situation familiale',
    genre: 'votre genre',
  }
  const liste = f.omissions.map((o) => noms[o.donnee]).join(', ')
  return `Pour ${f.marche.nom}, j’ai retiré ${liste} du document — pas seulement de l’affichage.`
}
