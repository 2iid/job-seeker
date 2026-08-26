/**
 * JOB-040 / REQ-007 — la contrainte, vérifiée SUR LA SORTIE.
 *
 * « Le générateur ne peut ni ajouter une expérience, ni un diplôme, ni une
 * compétence, ni modifier une date absente du profil canonique — contrainte
 * vérifiée par un test automatisé sur la sortie, PAS par une consigne au
 * modèle. »
 *
 * Les six derniers mots sont le ticket entier. Une consigne au modèle est une
 * demande polie : elle est suivie la plupart du temps, et le reste du temps
 * personne ne le sait. Or ce qui se joue ici n'est pas une imprécision de
 * style — c'est quelqu'un qui se présente en entretien avec une ligne de CV
 * qu'il n'a pas vécue, sans savoir qu'elle y est.
 *
 * ── Ce que le générateur a le droit de faire ──
 *
 *   SÉLECTIONNER  — retenir quatre expériences sur sept.
 *   ORDONNER      — mettre en avant celle qui parle à l'offre.
 *   REFORMULER    — récrire une description pour l'offre visée.
 *
 * ── Ce qu'il n'a le droit de faire à aucun prix ──
 *
 *   AJOUTER       — un employeur, un diplôme, une compétence qui n'existent pas.
 *   MODIFIER      — une date, un intitulé de poste, un nom d'établissement.
 *   CHIFFRER      — introduire un nombre absent de la description d'origine.
 *
 * Ce dernier point est le plus insidieux et il a sa propre vérification. Un
 * modèle qui reformule « j'ai accompagné la croissance de l'équipe » en
 * « croissance de l'équipe de 40 % » produit une phrase MEILLEURE, plus
 * concrète, plus convaincante — et c'est un chiffre inventé qu'un recruteur
 * demandera de détailler.
 */

import type { ProfilCanonique } from './profil-canonique.ts'

/** Ce que le générateur rend : des RÉFÉRENCES, pas du texte libre. */
export type ExperienceAdaptee = {
  /** Doit désigner une expérience du profil canonique. */
  readonly id: string
  /** Reformulation de la description. Le reste vient du profil, tel quel. */
  readonly description: string
}

export type CvAdapte = {
  readonly titreAccroche: string
  readonly experiences: readonly ExperienceAdaptee[]
  readonly formationIds: readonly string[]
  readonly competences: readonly string[]
}

export type Violation =
  | { readonly type: 'experience-inventee'; readonly id: string }
  | { readonly type: 'formation-inventee'; readonly id: string }
  | { readonly type: 'competence-inventee'; readonly libelle: string }
  | { readonly type: 'experience-dupliquee'; readonly id: string }
  | {
      readonly type: 'chiffre-invente'
      readonly id: string
      readonly chiffre: string
    }
  | { readonly type: 'description-vide'; readonly id: string }

/** Les nombres d'un texte, sous une forme comparable. */
function chiffres(texte: string): string[] {
  // On normalise les séparateurs : « 18 000 », « 18.000 » et « 18000 » sont le
  // même nombre, et n'en reconnaître qu'une écriture ferait crier au loup sur
  // une reformulation honnête.
  return [...texte.matchAll(/\d[\d\s.,\u00a0\u202f]*/g)]
    .map((m) => m[0].replace(/[\s.,\u00a0\u202f]/g, ''))
    .filter((n) => n !== '')
}

const comparable = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Vérifie un CV adapté contre le profil canonique.
 *
 * Rend la liste des violations. Une liste vide est la SEULE condition
 * d'acceptation : il n'y a pas de violation « mineure » ici, parce que la
 * personne qui découvrira l'écart le découvrira en entretien.
 */
export function verifierContrainte(
  cv: CvAdapte,
  profil: ProfilCanonique,
): readonly Violation[] {
  const violations: Violation[] = []

  const parId = new Map(profil.experiences.map((e) => [e.id, e]))
  const vues = new Set<string>()

  for (const a of cv.experiences) {
    const source = parId.get(a.id)
    if (source === undefined) {
      violations.push({ type: 'experience-inventee', id: a.id })
      continue
    }
    if (vues.has(a.id)) {
      // Une expérience répétée gonfle un parcours sans rien inventer de
      // nommable : deux fois le même poste se lit comme deux postes.
      violations.push({ type: 'experience-dupliquee', id: a.id })
    }
    vues.add(a.id)

    if (a.description.trim() === '') {
      violations.push({ type: 'description-vide', id: a.id })
      continue
    }

    // Chaque chiffre de la reformulation doit exister dans la description
    // d'origine. Un chiffre inventé produit une phrase MEILLEURE — plus
    // concrète, plus convaincante — et c'est celui qu'un recruteur demandera
    // de détailler.
    const origine = new Set(chiffres(source.description ?? ''))
    // Les dates du poste sont légitimes dans une description : elles viennent
    // du profil, même si elles n'étaient pas dans le texte d'origine.
    for (const d of [source.debut, source.fin ?? '']) {
      for (const n of chiffres(d)) origine.add(n)
    }
    for (const n of chiffres(a.description)) {
      if (!origine.has(n)) violations.push({ type: 'chiffre-invente', id: a.id, chiffre: n })
    }
  }

  const formations = new Set(profil.formations.map((f) => f.id))
  for (const id of cv.formationIds) {
    if (!formations.has(id)) violations.push({ type: 'formation-inventee', id })
  }

  const competences = new Set(profil.competences.map(comparable))
  for (const c of cv.competences) {
    if (!competences.has(comparable(c))) violations.push({ type: 'competence-inventee', libelle: c })
  }

  return violations
}

/** Un CV n'est utilisable que si AUCUNE violation n'a été trouvée. */
export function estUtilisable(violations: readonly Violation[]): boolean {
  return violations.length === 0
}

/** Ce qu'on dit à la personne quand la génération est refusée. */
export function expliquer(v: Violation): string {
  switch (v.type) {
    case 'experience-inventee':
      return 'Une expérience qui ne figure pas dans votre profil a été proposée.'
    case 'formation-inventee':
      return 'Une formation qui ne figure pas dans votre profil a été proposée.'
    case 'competence-inventee':
      return `La compétence « ${v.libelle} » ne figure pas dans votre profil.`
    case 'experience-dupliquee':
      return 'Une expérience apparaissait deux fois — deux fois le même poste se lit comme deux postes.'
    case 'chiffre-invente':
      return `Le chiffre « ${v.chiffre} » n’est pas dans votre profil. Je ne l’écris pas : c’est celui qu’on vous demanderait de détailler.`
    case 'description-vide':
      return 'Une expérience s’est retrouvée sans description.'
  }
}
