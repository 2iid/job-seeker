/**
 * JOB-037 / constat F19 — ce qu'on envoie au modèle pour scorer, et rien de plus.
 *
 * F19 disait : « le profil du candidat est inséré en clair dans le message
 * envoyé au modèle. C'est nécessaire pour scorer, mais cela signifie que du CV,
 * des employeurs et des dates partent chez un sous-traitant à chaque
 * évaluation. »
 *
 * ── Ce qu'un score a besoin de savoir, et ce qu'il n'a pas besoin de savoir ──
 *
 * Pour dire si une offre correspond, le modèle a besoin du MÉTIER : intitulés
 * tenus, durées, compétences, secteurs, langues. Il n'a besoin ni du nom, ni de
 * l'adresse électronique, ni du téléphone, ni de l'adresse postale — et ces
 * quatre-là sont précisément ce qui identifie quelqu'un.
 *
 * Les dates exactes non plus : « 2021-03-14 » n'aide pas à juger une
 * correspondance que « depuis 2021 » ne dise déjà. Une date au jour près
 * recoupée avec un employeur suffit souvent à retrouver une personne.
 *
 * ── Pourquoi ce n'est pas de la prudence décorative ──
 *
 * Le scoring tourne sur CHAQUE offre, plusieurs fois par jour, pendant des
 * mois. C'est de loin le chemin par lequel un profil part le plus souvent. Une
 * minimisation qui ne change rien à la qualité du résultat mais divise par
 * beaucoup ce qui sort est le genre d'économie qu'on ne refait jamais après
 * coup — parce qu'après coup, tout est déjà parti.
 *
 * ── Et ça sert aussi la reproductibilité ──
 *
 * Ce résumé est ce qu'on CONSERVE pour rejouer (`replay.ts`). Conserver un
 * profil complet à chaque score reviendrait à recopier la donnée personnelle
 * autant de fois qu'il y a d'offres.
 */

export type ExperienceProfil = {
  readonly employeur: string
  readonly intitule: string
  readonly debut: string
  readonly fin: string | null
  readonly description: string | null
}

export type ProfilComplet = {
  readonly nomComplet: string
  readonly email: string | null
  readonly telephone: string | null
  readonly localisation: string | null
  readonly titreAccroche: string | null
  readonly experiences: readonly ExperienceProfil[]
  readonly formations: readonly { intitule: string; etablissement: string; obtenueEn: number | null }[]
  readonly competences: readonly string[]
  readonly langues: readonly string[]
}

export type ResumeScoring = {
  readonly titre: string | null
  readonly experiences: readonly {
    readonly employeur: string
    readonly intitule: string
    readonly anneeDebut: number
    readonly anneeFin: number | null
    readonly resume: string | null
  }[]
  readonly formations: readonly string[]
  readonly competences: readonly string[]
  readonly langues: readonly string[]
  /** La ville, sans la rue. Le lieu compte pour juger une offre ; l'adresse, non. */
  readonly ville: string | null
}

const annee = (iso: string | null): number | null => {
  if (iso === null) return null
  const n = Number(iso.slice(0, 4))
  return Number.isFinite(n) && n > 1900 ? n : null
}

/**
 * La ville, sans le numéro ni la rue.
 *
 * « 12 rue des Lilas, Dakar » devient « Dakar ». Le lieu sert à juger une
 * offre ; l'adresse sert à retrouver quelqu'un.
 */
export function villeSeule(localisation: string | null): string | null {
  if (localisation === null) return null
  const morceaux = localisation
    .split(',')
    .map((m) => m.trim())
    // Un segment qui commence par un chiffre est un numéro de voie ou un code
    // postal : ni l'un ni l'autre n'aide à juger une offre.
    .filter((m) => m !== '' && !/^\d/.test(m))
    .filter((m) => !/\b(rue|avenue|boulevard|impasse|street|road|ave)\b/i.test(m))
  return morceaux.length === 0 ? null : morceaux.join(', ')
}

export function resumerPourScoring(p: ProfilComplet): ResumeScoring {
  return {
    titre: p.titreAccroche,
    experiences: p.experiences.map((e) => ({
      employeur: e.employeur,
      intitule: e.intitule,
      // L'ANNÉE, jamais la date. « 2021-03-14 » n'aide pas à juger une
      // correspondance que « 2021 » ne dise déjà, et une date au jour près
      // recoupée avec un employeur suffit souvent à retrouver une personne.
      anneeDebut: annee(e.debut) ?? 0,
      anneeFin: annee(e.fin),
      resume: e.description,
    })),
    // L'établissement est conservé — il porte du signal sur le niveau — mais
    // l'année de diplôme est retirée : elle donne l'âge à deux ans près.
    formations: p.formations.map((f) => `${f.intitule} — ${f.etablissement}`),
    competences: [...p.competences],
    langues: [...p.langues],
    ville: villeSeule(p.localisation),
  }
}

/** Les champs qu'un résumé de scoring ne doit JAMAIS porter. */
export const INTERDITS = ['nomComplet', 'email', 'telephone'] as const

/**
 * Vérifie qu'un résumé ne transporte aucune des données qu'on a retirées.
 *
 * Le contrôle porte sur le TEXTE SÉRIALISÉ, pas sur la forme de l'objet : une
 * adresse électronique recopiée à l'intérieur d'une description d'expérience
 * partirait quand même, et la structure ne dirait rien. C'est la même leçon que
 * la vérification des citations — on regarde ce qui SORT.
 */
export function fuites(resume: ResumeScoring, p: ProfilComplet): readonly string[] {
  const texte = JSON.stringify(resume).toLowerCase()
  const trouvees: string[] = []
  if (p.email !== null && p.email !== '' && texte.includes(p.email.toLowerCase())) trouvees.push('email')
  if (p.telephone !== null && p.telephone !== '') {
    // Les numéros s'écrivent avec des espaces, des points ou des tirets : on
    // compare les chiffres seuls, sinon le contrôle passe à côté.
    const chiffres = p.telephone.replace(/\D/g, '')
    if (chiffres.length >= 6 && texte.replace(/\D/g, '').includes(chiffres)) trouvees.push('telephone')
  }
  if (p.nomComplet !== '' && texte.includes(p.nomComplet.toLowerCase())) trouvees.push('nomComplet')
  return trouvees
}
