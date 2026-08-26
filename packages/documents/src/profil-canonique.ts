/**
 * JOB-040 — le profil canonique, tel que le générateur a le droit de le voir.
 *
 * Chaque élément porte un IDENTIFIANT, et c'est le pivot de tout le module.
 * Le générateur ne rend pas du texte libre : il rend une SÉLECTION d'éléments
 * désignés par leur identifiant, plus une reformulation de leur description.
 *
 * Cette forme est ce qui rend la contrainte de REQ-007 vérifiable
 * mécaniquement. « Le générateur ne peut ni ajouter une expérience, ni un
 * diplôme, ni une compétence, ni modifier une date » ne se vérifie pas sur un
 * paragraphe : il faudrait relire. Sur une liste d'identifiants, ça se vérifie
 * par une appartenance à un ensemble.
 */

export type ExperienceCanonique = {
  readonly id: string
  readonly employeur: string
  readonly intitule: string
  /** ISO, avec sa précision — jamais reformulée par le générateur. */
  readonly debut: string
  readonly fin: string | null
  readonly description: string | null
}

export type FormationCanonique = {
  readonly id: string
  readonly etablissement: string
  readonly intitule: string
  readonly obtenueEn: number | null
}

export type ProfilCanonique = {
  readonly nomComplet: string
  readonly titreAccroche: string | null
  readonly email: string | null
  readonly telephone: string | null
  readonly localisation: string | null
  readonly experiences: readonly ExperienceCanonique[]
  readonly formations: readonly FormationCanonique[]
  readonly competences: readonly string[]
  readonly langues: readonly string[]
}
