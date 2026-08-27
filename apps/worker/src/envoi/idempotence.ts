/**
 * JOB-051 — ne jamais envoyer deux fois.
 *
 * ── L'asymétrie qui décide de tout ──
 *
 * Ne pas envoyer coûte une occasion, que la personne rattrape d'un clic.
 * Envoyer deux fois coûte une candidature en double chez un recruteur, qui ne
 * se reprend pas. Chaque fois qu'un doute subsiste, ce fichier choisit donc de
 * NE PAS envoyer — et de le dire, plutôt que d'abandonner en silence.
 */

import type pg from 'pg'
import type { Canal } from '@job-seeker/profil'

export type EtatReclamation = {
  readonly issue: 'en-cours' | 'prepare' | 'envoye' | 'refuse' | 'incertain'
  readonly bailJusquA: Date | null
  readonly reclamePar: string | null
}

export type Reprise =
  /** Rien n'existe, ou la tentative précédente n'a rien envoyé. On peut y aller. */
  | { readonly action: 'envoyer' }
  /** Déjà parti. Le cœur de REQ-011. */
  | { readonly action: 'doublon'; readonly explication: string }
  /** Quelqu'un d'autre tient la réclamation, et son bail court encore. */
  | { readonly action: 'occupe'; readonly explication: string }
  /** Une réclamation abandonnée. On ne sait pas si c'est parti. */
  | { readonly action: 'incertain'; readonly explication: string }

/**
 * Que faire face à une tentative antérieure ?
 *
 * Fonction PURE, et c'est délibéré : c'est la seule partie de l'idempotence
 * qu'on puisse éprouver exhaustivement, et elle contient toutes les décisions.
 * Le reste n'est que du SQL.
 */
export function deciderReprise(e: EtatReclamation | null, maintenant: Date): Reprise {
  if (e === null) return { action: 'envoyer' }

  switch (e.issue) {
    case 'envoye':
      return {
        action: 'doublon',
        explication:
          'Vous avez déjà candidaté à cette offre. Je ne recommence pas : une seconde ' +
          'candidature au même poste ne se reprend pas.',
      }

    case 'en-cours': {
      const bail = e.bailJusquA
      if (bail !== null && bail.getTime() > maintenant.getTime()) {
        return {
          action: 'occupe',
          explication: 'Un envoi est déjà en cours pour cette offre.',
        }
      }
      // LE CAS QUI JUSTIFIE TOUT LE FICHIER. Un bail expiré signifie qu'un
      // worker est mort en tenant la réclamation. Il est mort AVANT d'envoyer,
      // ou APRÈS — rien ici ne permet de le savoir.
      //
      // La tentation est de présumer l'échec et de réessayer : c'est le
      // raisonnement qui envoie deux fois. Un bail expiré ne rend donc JAMAIS
      // la réclamation ; il la rend incertaine.
      return {
        action: 'incertain',
        explication:
          'Un envoi a été interrompu pour cette offre et je ne sais pas s’il est parti. ' +
          'Je ne réessaie pas tout seul — vérifiez, puis dites-moi quoi faire.',
      }
    }

    case 'incertain':
      // Une incertitude ne se résout pas en réessayant : elle se résout en
      // regardant. Elle reste donc telle quelle jusqu'à une décision humaine.
      return {
        action: 'incertain',
        explication:
          'Cette offre porte déjà un envoi dont l’issue est inconnue. Elle attend votre décision.',
      }

    case 'prepare':
    case 'refuse':
      // Aucune de ces deux issues n'a rien fait sortir. Reprendre est sûr.
      return { action: 'envoyer' }
  }
}

/** Normalise un intitulé pour comparer deux annonces d'un même poste. */
export function normaliserTitre(titre: string): string {
  return (
    titre
      .normalize('NFD')
      // Les diacritiques, par point de code plutôt qu'en clair : un caractère
      // combinant dans un littéral est invisible à la relecture et se perd au
      // premier copier-coller.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // ATTENTION À L'ORDRE. Les accents sont déjà tombés à ce stade : chercher
      // « réf » ici ne trouve plus rien, puisque la chaîne porte « ref ». Le
      // premier jet le faisait, et le test l'a dit.
      .replace(/\(?\s*[hf]\s*\/\s*[hf]\s*\)?/g, ' ')
      .replace(/\bref\.?\s*\w+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
}

export const FENETRE_REPUBLICATION_JOURS = 90

export type Anterieure = {
  readonly employeurCanonique: string
  readonly titre: string
  readonly envoyeLe: Date
}

/**
 * Le doublon que la clé primaire ne voit pas : l'employeur REPUBLIE l'annonce.
 *
 * La déduplication d'offres ne les rapproche pas — nouvelle référence, nouvelle
 * ligne, nouvelle opportunité — et tout le mécanisme ci-dessus laisse donc
 * passer une deuxième candidature au même poste, chez le même employeur, à
 * quelques semaines d'intervalle. C'est le doublon que le recruteur VOIT.
 *
 * Il n'est pas traité comme le précédent : une candidature au même poste six
 * mois plus tard est légitime. La fenêtre est donc bornée, et le résultat est
 * une ESCALADE et non un refus définitif — nous signalons, la personne tranche.
 */
export function republicationProbable(
  cible: { employeurCanonique: string; titre: string },
  anterieures: readonly Anterieure[],
  maintenant: Date,
): Anterieure | null {
  const titre = normaliserTitre(cible.titre)
  const employeur = cible.employeurCanonique.trim().toLowerCase()
  const limite = maintenant.getTime() - FENETRE_REPUBLICATION_JOURS * 86_400_000
  return (
    anterieures.find(
      (a) =>
        a.employeurCanonique.trim().toLowerCase() === employeur &&
        normaliserTitre(a.titre) === titre &&
        a.envoyeLe.getTime() >= limite,
    ) ?? null
  )
}

// ---------------------------------------------------------------------------
//  La partie SQL. Toute la décision est au-dessus ; ici, seulement l'atomicité.
// ---------------------------------------------------------------------------

export type Reclamation = { readonly tenue: boolean; readonly etat: EtatReclamation | null }

/**
 * Prend la réclamation, ou dit qui la tient déjà.
 *
 * `on conflict do nothing` puis relecture : deux ordres, mais l'insertion est
 * atomique et c'est la seule chose qui compte. Deux workers qui la tentent en
 * même temps : un seul obtient une ligne, l'autre en obtient zéro et va lire ce
 * qui existe.
 */
export async function reclamer(
  db: pg.Client | pg.Pool,
  p: {
    profileId: string
    opportuniteId: string
    canal: Canal
    parQui: string
    bailSecondes: number
  },
): Promise<Reclamation> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.dossiers
       (profile_id, opportunite_id, canal, issue, reclame_le, reclame_par, bail_jusqu_a)
     values ($1, $2, $3, 'en-cours', now(), $4, now() + make_interval(secs => $5))
     on conflict (opportunite_id, canal) do nothing
     returning id`,
    [p.profileId, p.opportuniteId, p.canal, p.parQui, p.bailSecondes],
  )
  if (rows.length > 0) return { tenue: true, etat: null }

  const { rows: existant } = await db.query<{
    issue: EtatReclamation['issue']
    bail_jusqu_a: Date | null
    reclame_par: string | null
  }>(
    `select issue, bail_jusqu_a, reclame_par from public.dossiers
      where opportunite_id = $1 and canal = $2`,
    [p.opportuniteId, p.canal],
  )
  const e = existant[0]
  if (e === undefined) {
    // La ligne a disparu entre les deux ordres. Extrêmement improbable, et
    // néanmoins : on ne devine pas, on redemande au tour suivant.
    return { tenue: false, etat: null }
  }
  return {
    tenue: false,
    etat: { issue: e.issue, bailJusquA: e.bail_jusqu_a, reclamePar: e.reclame_par },
  }
}

/**
 * Reprend une réclamation dont l'issue est 'prepare' ou 'refuse' — les deux
 * seules qui n'ont rien fait sortir.
 *
 * La condition est DANS le `where`, pas dans le code appelant : une reprise
 * décidée en mémoire puis écrite sans condition rouvrirait la course qu'on
 * vient de fermer.
 */
export async function reprendre(
  db: pg.Client | pg.Pool,
  p: { opportuniteId: string; canal: Canal; parQui: string; bailSecondes: number },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update public.dossiers
        set issue = 'en-cours', reclame_le = now(), reclame_par = $3,
            bail_jusqu_a = now() + make_interval(secs => $4), updated_at = now()
      where opportunite_id = $1 and canal = $2 and issue in ('prepare', 'refuse')`,
    [p.opportuniteId, p.canal, p.parQui, p.bailSecondes],
  )
  return (rowCount ?? 0) > 0
}
