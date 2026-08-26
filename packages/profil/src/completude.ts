/**
 * JOB-033 — ce qui manque, et ce que ça empêche.
 *
 * Une seule définition de « prêt », partagée par l'écran et par le moteur.
 * C'est la raison d'être de ce module, et elle n'est pas esthétique : si
 * l'écran calcule sa propre idée de la complétude, les deux divergeront, et
 * c'est le moteur qui aura le dernier mot. Le jour où ils divergent dans le
 * mauvais sens, l'écran annonce « tout est prêt » et l'agent postule sur un
 * profil dont il manque l'autorisation de travail.
 *
 * ── Ce que ce module refuse de faire ──
 *
 * Il ne BLOQUE rien. REQ-002 est explicite : « le profil reste utilisable tant
 * que les critères sont incomplets ». Un formulaire qui refuse d'avancer n'est
 * pas une garantie de qualité, c'est une porte fermée — et la personne qui
 * remplit un profil de recherche d'emploi n'a pas toujours les réponses le
 * jour où elle commence.
 *
 * ── Pourquoi chaque manque nomme sa CONSÉQUENCE ──
 *
 * « Il manque votre autorisation de travail » n'apprend rien : on le voyait
 * déjà, le champ est vide. « Sans elle, je ne peux postuler automatiquement
 * nulle part » dit ce qu'on gagne à le remplir. Un manque sans conséquence est
 * une réprimande ; un manque avec sa conséquence est une raison.
 */

export type Portee =
  /** Empêche toute candidature automatique, partout. */
  | 'automatisation'
  /** Empêche de trouver des offres — la veille n'a pas de cible. */
  | 'veille'
  /** Dégrade la qualité sans rien empêcher. */
  | 'qualite'

export type Manque = {
  readonly cle: string
  /** Ce qui manque, du point de vue de la personne. */
  readonly quoi: string
  /** Ce que ce manque empêche PRÉCISÉMENT. Jamais une généralité. */
  readonly empeche: string
  readonly portee: Portee
  /** Où aller le remplir. */
  readonly ou: string
}

export type ProfilPourCompletude = {
  readonly titreAccroche: string | null
  readonly autorisationTravail: readonly string[]
  readonly experiences: number
  readonly competences: number
  readonly aUnCv: boolean
}

export type CriteresPourCompletude = {
  readonly intitules: readonly string[]
  readonly presence: readonly string[]
  readonly zones: readonly string[]
} | null

export type Completude = {
  readonly manques: readonly Manque[]
  /** L'automatisation peut-elle s'activer ? Faux dès qu'un manque la porte. */
  readonly peutAutomatiser: boolean
  /** La veille peut-elle tourner ? Elle peut, même sans automatisation. */
  readonly peutVeiller: boolean
}

const M = (
  cle: string, quoi: string, empeche: string, portee: Portee, ou: string,
): Manque => ({ cle, quoi, empeche, portee, ou })

/**
 * L'état du profil, en une passe et sans effet de bord.
 *
 * L'ordre des manques est celui de leur GRAVITÉ, pas celui du formulaire :
 * quelqu'un qui lit trois lignes doit lire les trois qui comptent.
 */
export function evaluerCompletude(
  profil: ProfilPourCompletude,
  criteres: CriteresPourCompletude,
): Completude {
  const manques: Manque[] = []

  if (profil.autorisationTravail.length === 0) {
    manques.push(M(
      'autorisation',
      'Les pays où vous pouvez travailler sans démarche',
      'Sans cette information je ne postule automatiquement nulle part : c’est un critère rédhibitoire, et je préfère ne rien envoyer plutôt que d’envoyer à tort.',
      'automatisation',
      '/profil',
    ))
  }

  if (criteres === null || criteres.intitules.length === 0) {
    manques.push(M(
      'intitules',
      'Les intitulés de poste que vous visez',
      'Sans eux je n’ai pas de cible : je ne peux ni chercher, ni juger si une offre vous correspond.',
      'veille',
      '/criteres',
    ))
  }

  if (criteres !== null && criteres.presence.length === 0) {
    manques.push(M(
      'presence',
      'Distanciel, hybride ou présentiel',
      'Sans ce choix je ne peux pas écarter les offres qui exigent une présence là où vous n’êtes pas — je vous les montrerai toutes.',
      'automatisation',
      '/criteres',
    ))
  }

  if (criteres !== null && criteres.presence.some((p) => p !== 'distanciel') && criteres.zones.length === 0) {
    manques.push(M(
      'zones',
      'Les zones où vous pouvez être présente',
      'Vous acceptez des postes qui demandent une présence, mais je ne sais pas où. Je ne postulerai pas automatiquement à ceux-là.',
      'automatisation',
      '/criteres',
    ))
  }

  if (!profil.aUnCv) {
    manques.push(M(
      'cv',
      'Votre CV',
      'Sans CV je ne peux pas constituer de candidature — ni l’adapter à une offre, ni l’envoyer.',
      'automatisation',
      '/profil/import',
    ))
  }

  if (profil.experiences === 0) {
    manques.push(M(
      'experiences',
      'Au moins une expérience',
      'Je n’ai rien à mettre en face des attentes d’une offre : mes explications de score seront vides et mes CV adaptés aussi.',
      'automatisation',
      '/profil',
    ))
  }

  if (profil.competences === 0) {
    manques.push(M(
      'competences',
      'Vos compétences',
      'Je peux chercher sans, mais je jugerai moins bien : c’est là-dessus que se joue la plupart des correspondances.',
      'qualite',
      '/profil',
    ))
  }

  if (profil.titreAccroche === null || profil.titreAccroche.trim() === '') {
    manques.push(M(
      'accroche',
      'Votre intitulé actuel',
      'Il sert d’en-tête à vos candidatures. Sans lui, elles commencent par un blanc.',
      'qualite',
      '/profil',
    ))
  }

  return {
    manques,
    peutAutomatiser: !manques.some((m) => m.portee === 'automatisation'),
    peutVeiller: !manques.some((m) => m.portee === 'veille'),
  }
}

/**
 * Une phrase, pour l'en-tête de l'écran.
 *
 * Elle dit le NOMBRE et la conséquence la plus grave, jamais « profil
 * incomplet » : quelqu'un à qui il manque une case et quelqu'un qui n'a rien
 * rempli liraient la même chose.
 */
export function resumer(c: Completude, locale: 'fr' | 'en' = 'fr'): string {
  if (c.manques.length === 0) {
    return locale === 'en'
      ? 'Your profile is complete. I can search and apply on your behalf.'
      : 'Votre profil est complet. Je peux chercher et postuler pour vous.'
  }
  const n = c.manques.length
  if (locale === 'en') {
    if (!c.peutVeiller) return `${n} things are missing, and one of them stops me from searching at all.`
    if (!c.peutAutomatiser) return `${n} things are missing. I can search, but I will not apply on my own yet.`
    return `${n} things would make me better at this. Nothing is blocked.`
  }
  const s = n > 1 ? 's' : ''
  if (!c.peutVeiller) return `Il manque ${n} chose${s}, et l’une d’elles m’empêche même de chercher.`
  if (!c.peutAutomatiser) {
    return `Il manque ${n} chose${s}. Je peux chercher, mais je ne postulerai pas seule tant que ce n’est pas comblé.`
  }
  return `${n} chose${s} me rendrai${n > 1 ? 'ent' : 't'} meilleure. Rien n’est bloqué.`
}
