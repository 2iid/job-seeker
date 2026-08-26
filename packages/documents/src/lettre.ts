/**
 * JOB-044 — la lettre, dans la langue de l'offre.
 *
 * Elle est soumise à la même règle que le CV, pour la même raison : ce qui
 * part en votre nom ne peut affirmer que ce que vous avez dit. Mais la
 * vérification ne peut pas être la même — une lettre est de la prose, et
 * contraindre de la prose par identifiants la rendrait illisible.
 *
 * On vérifie donc les deux choses qui se vérifient VRAIMENT sur du texte :
 *
 * · **Les chiffres.** Tout nombre de la lettre doit exister dans le profil.
 *   C'est la même règle que pour le CV, et pour la même raison : « j'ai fait
 *   croître l'équipe de 40 % » est la phrase qu'un recruteur relèvera.
 *
 * · **Les employeurs et diplômes nommés.** Une lettre qui cite « mon passage
 *   chez Google » quand le profil n'en parle pas est un mensonge qui tiendra
 *   quinze secondes en entretien.
 *
 * Le reste — le ton, la structure, l'argument — est du style, et le style
 * n'est pas vérifiable. C'est pour ça que la lettre reste ENTIÈREMENT
 * ÉDITABLE, comme REQ-008 l'exige : la vérification attrape ce qui se
 * démontre, et la personne relit le reste.
 */

import { CONSIGNE_FRONTIERE, encadrer, estSuspect } from '@job-seeker/llm-guard'
import { choisirLangue, NOMS_LANGUES, type Langue, type VerdictLangue } from './langue.ts'
import type { ProfilCanonique } from './profil-canonique.ts'
import type { Completer, Journal } from './cv.ts'

const CONSIGNE_LANGUE: Readonly<Record<Exclude<Langue, 'inconnue'>, string>> = {
  fr: 'Écris en français.', en: 'Write in English.', es: 'Escribe en español.',
  de: 'Schreibe auf Deutsch.', nl: 'Schrijf in het Nederlands.',
  it: 'Scrivi in italiano.', pt: 'Escreva em português.',
}

const SYSTEME = (langue: Exclude<Langue, 'inconnue'>): string => `Tu écris une lettre de motivation.

${CONSIGNE_LANGUE[langue]}

Tu n'écris QUE ce que le profil contient. Tu n'inventes ni chiffre, ni
employeur, ni diplôme, ni compétence. Si le profil ne dit pas de combien une
équipe a grandi, tu ne le dis pas non plus.

Tu es sobre. Pas de superlatif, pas de flatterie envers l'entreprise, pas de
« passionné depuis toujours ». Trois paragraphes au plus.

${CONSIGNE_FRONTIERE}`

export type Violation =
  | { readonly type: 'chiffre-invente'; readonly chiffre: string }
  | { readonly type: 'employeur-invente'; readonly nom: string }

const chiffres = (t: string): string[] =>
  [...t.matchAll(/\d[\d\s.,\u00a0\u202f]*/g)]
    .map((m) => m[0].replace(/[\s.,\u00a0\u202f]/g, ''))
    .filter((n) => n !== '')

const sansAccent = (v: string): string => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Les organisations qu'une lettre prétend AVOIR FRÉQUENTÉES.
 *
 * La première version cherchait « un mot capitalisé absent du profil ». Deux
 * essais contre le vrai modèle l'ont démolie : elle accusait « Growth »,
 * « Lead », « English », puis « Manager », « January », « Masters ». L'anglais
 * capitalise les titres de poste, les mois et les diplômes ; aucune liste de
 * mots ne rattrapera ça, et chaque faux positif apprend à passer outre.
 *
 * On ne cherche donc plus un nom propre — on cherche la CONSTRUCTION qui porte
 * le risque. Une lettre qui invente un employeur le dit d'une façon très
 * particulière : « chez Google », « at Google », « bij Bol ». C'est
 * l'affirmation d'un rattachement, et c'est elle qui tiendra quinze secondes
 * en entretien.
 *
 * Le compromis est assumé et il est dans le bon sens : on rate une invention
 * formulée autrement, et on n'accuse plus une lettre honnête. Un contrôle qui
 * crie au loup finit ignoré ; un contrôle silencieux la moitié du temps reste
 * lu l'autre moitié. Et la lettre reste ENTIÈREMENT ÉDITABLE (REQ-008) : ce
 * contrôle attrape ce qui se démontre, la personne relit le reste.
 */
const RATTACHEMENT =
  /\b(?:chez|au sein de|at|with|for|bij|bei|presso|en)\s+((?:\p{Lu}[\p{L}&-]*(?:\s+(?:de|du|of|van|der)?\s*)?){1,3})/gu

export function organisationsCitees(texte: string): string[] {
  const trouvees: string[] = []
  // Phrase par phrase : une capture qui franchit un point attrape le premier
  // mot de la phrase suivante. Un essai réel a rendu « Northwind. I » —
  // l'employeur visé, parfaitement légitime, refusé à cause d'un pronom.
  for (const phrase of texte.split(/[.!?\n;:]+/)) {
    for (const m of phrase.matchAll(RATTACHEMENT)) {
      const brut = (m[1] ?? '').trim().replace(/[,]$/, '')
      if (brut !== '') trouvees.push(brut)
    }
  }
  return [...new Set(trouvees)]
}

export function vocabulaireLegitime(
  profil: ProfilCanonique,
  supplements: readonly string[] = [],
): ReadonlySet<string> {
  const v = new Set<string>()
  const ajouter = (texte: string): void => {
    for (const mot of texte.split(/[^\p{L}\p{N}&.-]+/u)) {
      if (mot !== '') v.add(sansAccent(mot))
    }
  }
  for (const e of profil.experiences) ajouter(`${e.employeur} ${e.intitule} ${e.description ?? ''}`)
  for (const f of profil.formations) ajouter(`${f.etablissement} ${f.intitule}`)
  ajouter([...profil.competences, ...profil.langues].join(' '))
  ajouter(`${profil.nomComplet} ${profil.localisation ?? ''} ${profil.titreAccroche ?? ''}`)
  for (const s of supplements) ajouter(s)
  // Les noms de langue, dans toutes les langues connues : le profil dit
  // « anglais », la lettre en anglais dit « English ».
  for (const noms of Object.values(NOMS_LANGUES)) for (const n of noms) v.add(n)
  return v
}

export function verifierLettre(
  lettre: string,
  profil: ProfilCanonique,
  supplements: readonly string[] = [],
): readonly Violation[] {
  const violations: Violation[] = []

  const connus = new Set<string>()
  for (const e of profil.experiences) {
    for (const n of chiffres(`${e.description ?? ''} ${e.debut} ${e.fin ?? ''}`)) connus.add(n)
  }
  for (const f of profil.formations) if (f.obtenueEn !== null) connus.add(String(f.obtenueEn))
  for (const n of chiffres(lettre)) {
    if (!connus.has(n)) violations.push({ type: 'chiffre-invente', chiffre: n })
  }

  const vocabulaire = vocabulaireLegitime(profil, supplements)

  return violations.concat(
    organisationsCitees(lettre)
      // Une organisation citée est légitime si CHACUN de ses mots l'est : le
      // profil dit « Wave Sénégal », la lettre peut dire « Wave ».
      .filter((org) => !org.split(/\s+/).every((mot) => vocabulaire.has(sansAccent(mot))))
      .map((nom): Violation => ({ type: 'employeur-invente', nom })),
  )
}

export type ResultatLettre =
  | { readonly ok: true; readonly lettre: string; readonly langue: Langue }
  | {
      readonly ok: false
      readonly motif: 'langue' | 'contrainte' | 'refus-modele'
      readonly explication: string
      readonly verdictLangue?: VerdictLangue
      readonly violations?: readonly Violation[]
    }

export async function engendrerLettre(
  profil: ProfilCanonique,
  offre: { readonly texte: string; readonly employeur: string },
  completer: Completer,
  options: { imputableA: string; journal?: Journal; langueImposee?: Exclude<Langue, 'inconnue'> },
): Promise<ResultatLettre> {
  // La langue AVANT tout : inutile de dépenser un appel pour un document qu'on
  // s'apprête à refuser.
  let langue: Exclude<Langue, 'inconnue'>
  if (options.langueImposee !== undefined) {
    // Le choix explicite de la personne l'emporte, y compris sur l'alerte de
    // maîtrise : c'est elle qui sait ce qu'elle peut défendre.
    langue = options.langueImposee
  } else {
    const verdict = choisirLangue(offre.texte, profil.langues)
    if (!verdict.ecrire) {
      return { ok: false, motif: 'langue', explication: verdict.explication, verdictLangue: verdict }
    }
    langue = verdict.langue as Exclude<Langue, 'inconnue'>
  }

  const encadre = encadrer(offre.texte, "annonce d'emploi")
  if (estSuspect(encadre)) {
    options.journal?.log('warn', 'contenu d offre suspect', { count: encadre.signaux.length })
  }

  const reponse = await completer({
    systeme: SYSTEME(langue),
    messages: [
      {
        role: 'user',
        content:
          `Profil (JSON) :\n${JSON.stringify(profil)}\n\n` +
          `Entreprise visée : ${offre.employeur}\n\nOffre :\n\n${encadre.bloc}\n\n` +
          'Réponds UNIQUEMENT par le texte de la lettre, sans en-tête ni signature.',
      },
    ],
    maxTokens: 1500,
    imputableA: options.imputableA,
    effort: 'medium',
  })

  if (reponse.refus) {
    return { ok: false, motif: 'refus-modele', explication: 'Le modèle a décliné cette rédaction.' }
  }

  const lettre = reponse.texte.trim()
  // L'offre entière est du vocabulaire légitime : la lettre lui répond, et
  // peut donc en citer le titre du poste, l'employeur et le secteur.
  const violations = verifierLettre(lettre, profil, [offre.texte, offre.employeur])

  if (violations.length > 0) {
    options.journal?.log('warn', 'lettre hors contrainte', { types: violations.map((v) => v.type) })
    return {
      ok: false,
      motif: 'contrainte',
      explication:
        'La lettre proposée affirme des choses qui ne sont pas dans votre profil. Je ne vous la ' +
        'donne pas : c’est exactement ce qu’on vous demanderait de justifier.',
      violations,
    }
  }

  return { ok: true, lettre, langue }
}
