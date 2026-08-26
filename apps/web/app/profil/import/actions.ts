'use server'

/**
 * JOB-032 — les deux moments de l'import, et pourquoi ils sont séparés.
 *
 * `analyser` LIT. `confirmer` ÉCRIT. Rien d'autre ne les relie qu'un aller-
 * retour par l'écran, où quelqu'un a regardé. C'est la forme que prend REQ-001
 * dans le code : une extraction plausible ne devient le profil de personne tant
 * qu'un humain n'a pas dit oui.
 *
 * La conséquence la moins évidente, et la plus importante : `confirmer`
 * NE FAIT PAS CONFIANCE à ce que `analyser` a rendu. La proposition transite
 * par le navigateur, donc elle revient modifiable — c'est le but, la personne
 * l'édite. Mais alors elle revient aussi FALSIFIABLE. Tout ce qui décide de
 * quelque chose est donc recalculé côté serveur : l'identité, le profil visé,
 * le chemin de stockage. Le navigateur ne renvoie que du contenu.
 */

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { cheminStockage, extraire, lire, lireDate, messageDeRefus, MIME, PLAFOND_OCTETS } from '@job-seeker/parsing'
import type { Proposition } from '@job-seeker/parsing'
import { creerBascule, fournisseurAnthropique, fournisseurOpenRouter } from '@job-seeker/llm'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type EtatImport =
  | { etape: 'vierge' }
  | { etape: 'refuse'; message: string }
  | {
      etape: 'propose'
      proposition: Proposition
      documentId: string
      nomOrigine: string
      /** Le verdict du SERVEUR sur les octets. L'écran ne le redéduit pas du nom. */
      type: 'pdf' | 'docx'
      taille: number
    }

export async function analyser(_precedent: EtatImport, formulaire: FormData): Promise<EtatImport> {
  // L'identité d'abord, et depuis le serveur d'authentification. Aucun
  // identifiant venu du formulaire n'entre dans une décision.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil%2Fimport')

  const fichier = formulaire.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { etape: 'refuse', message: messageDeRefus({ motif: 'vide' }, 'fr') }
  }

  // La taille est vérifiée AVANT de lire le corps. `File.size` vient de
  // l'en-tête, donc de l'expéditeur — mais s'en servir pour refuser tôt ne
  // coûte rien et évite de charger 500 Mo en mémoire pour découvrir qu'ils
  // sont de trop. Le contrôle qui fait autorité reste `examiner()`, sur les
  // octets réellement lus, juste après.
  if (fichier.size > PLAFOND_OCTETS) {
    return {
      etape: 'refuse',
      message: messageDeRefus(
        { motif: 'trop-gros', octets: fichier.size, plafond: PLAFOND_OCTETS },
        'fr',
      ),
    }
  }

  const octets = new Uint8Array(await fichier.arrayBuffer())
  const lu = await lire(octets)
  if (!lu.ok) {
    return { etape: 'refuse', message: messageDeRefus(lu.refus, 'fr') }
  }

  const bascule = creerBascule([fournisseurAnthropique(), fournisseurOpenRouter()])
  const proposition = await extraire(lu.texte, (d) => bascule.completer(d), {
    imputableA: `import:${utilisateur.id}`,
  })

  // Le fichier est déposé MAINTENANT, alors que rien du profil n'est encore
  // écrit. C'est volontaire : le document d'origine doit rester consultable
  // pour que la personne puisse comparer ce qu'on lui propose à ce qu'elle a
  // envoyé. Un fichier sans profil est inerte ; un profil sans son fichier
  // source serait invérifiable.
  const documentId = randomUUID()
  const chemin = cheminStockage(utilisateur.id, documentId, lu.type)
  const supabase = await clientServeur()
  const { error } = await supabase.storage
    .from('documents')
    .upload(chemin, octets, { contentType: MIME[lu.type], upsert: false })
  if (error !== null) {
    return {
      etape: 'refuse',
      message:
        'Le fichier a été lu mais n’a pas pu être conservé. Réessayez ; si cela se reproduit, ' +
        'le stockage est indisponible et vos données n’ont pas été modifiées.',
    }
  }

  return {
    etape: 'propose',
    proposition,
    documentId,
    nomOrigine: fichier.name,
    type: lu.type,
    taille: octets.length,
  }
}

/**
 * Écrit ce que la personne a confirmé — et seulement dans SON profil.
 *
 * Ce qui arrive ici a transité par le navigateur. C'est donc du contenu que
 * l'utilisateur a pu modifier (c'est le but) ET falsifier (c'est la
 * conséquence). Rien de structurel n'en est repris : ni l'identité, ni le
 * profil, ni le chemin du fichier — tous recalculés.
 */
export async function confirmer(_precedent: unknown, formulaire: FormData): Promise<{ message: string } | never> {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil%2Fimport')

  const documentId = String(formulaire.get('documentId') ?? '')
  const nomOrigine = String(formulaire.get('nomOrigine') ?? '')
  // Le type revient par le formulaire, donc il est falsifiable. Il n'est
  // accepté que s'il est l'une des deux valeurs possibles, et il ne sert qu'à
  // composer le nom du fichier déjà déposé — un type mensonger ne peut donc
  // désigner qu'un chemin inexistant, jamais le fichier de quelqu'un d'autre :
  // le premier segment reste `auth.uid()`, recalculé ici.
  const type = String(formulaire.get('type') ?? '')
  if (type !== 'pdf' && type !== 'docx') return { message: 'Import invalide.' }

  const supabase = await clientServeur()

  // Le profil est retrouvé par l'identité vérifiée, jamais reçu du formulaire.
  const { data: profil } = await supabase.from('profiles').select('id').single()
  if (profil === null) return { message: 'Profil introuvable.' }

  const chemin = cheminStockage(utilisateur.id, documentId, type)
  // `examiner` a déjà tranché le type à l'aller ; on ne réutilise pas le type
  // MIME annoncé par le navigateur, on relit celui que le verdict impose.
  const typeMime = MIME[type]

  const champs = (n: string): string => String(formulaire.get(n) ?? '').trim()

  const { error: erreurDoc } = await supabase.from('documents').insert({
    profile_id: profil.id,
    genre: 'cv_source',
    nom_origine: nomOrigine,
    chemin_stockage: chemin,
    type_mime: typeMime,
    taille_octets: Math.max(1, Number(formulaire.get('taille') ?? 1) || 1),
  })
  if (erreurDoc !== null) return { message: 'L’enregistrement du document a échoué. Rien n’a été modifié.' }

  const { error: erreurProfil } = await supabase
    .from('profiles')
    .update({ titre_accroche: champs('titreAccroche') })
    .eq('id', profil.id)
  if (erreurProfil !== null) return { message: 'L’enregistrement du profil a échoué.' }

  // Le parcours. Les champs arrivent indexés (`exp.0.employeur`) : on remonte
  // les index présents plutôt que de compter, parce qu'un formulaire tronqué ou
  // trafiqué n'a aucune obligation d'être continu.
  const index = [
    ...new Set(
      [...formulaire.keys()]
        .map((c) => /^exp\.(\d+)\./.exec(c)?.[1])
        .filter((v): v is string => v !== undefined),
    ),
  ]

  const experiences = index
    .map((i, ordre) => {
      const debut = lireDate(champs(`exp.${i}.debut`))
      const fin = lireDate(champs(`exp.${i}.fin`))
      const employeur = champs(`exp.${i}.employeur`)
      const intitule = champs(`exp.${i}.intitule`)
      // `debut` est obligatoire en base. Une expérience sans début lisible est
      // ÉCARTÉE plutôt qu'ancrée sur une date choisie par nous : le CV et le
      // fichier d origine restent consultables, la personne peut la ressaisir.
      if (employeur === '' || intitule === '' || debut === null) return null
      return {
        profile_id: profil.id,
        employeur,
        intitule,
        debut: debut.iso,
        debut_precision: debut.precision,
        fin: fin?.iso ?? null,
        fin_precision: fin?.precision ?? null,
        description: champs(`exp.${i}.resume`) || null,
        ordre,
      }
    })
    .filter((e) => e !== null)

  if (experiences.length > 0) {
    const { error } = await supabase.from('experiences').insert(experiences)
    if (error !== null) return { message: 'L’enregistrement du parcours a échoué.' }
  }

  const competences = [...formulaire.keys()]
    .filter((c) => c.startsWith('comp.'))
    .map((c) => champs(c))
    .filter((l) => l !== '')
  if (competences.length > 0) {
    // `unique (profile_id, libelle)` : deux lignes identiques dans le
    // formulaire feraient échouer tout l insert. On dédoublonne ici.
    const uniques = [...new Set(competences)].map((libelle) => ({ profile_id: profil.id, libelle }))
    const { error } = await supabase.from('competences').insert(uniques)
    if (error !== null) return { message: 'L’enregistrement des compétences a échoué.' }
  }

  redirect('/profil?importe=1')
}
