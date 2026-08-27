/**
 * JOB-055 / REQ-013 — « la preuve exacte de ce qui a été envoyé en mon nom ».
 *
 * ── Ce que « exacte » interdit ──
 *
 * Un reçu ne référence pas le CV : il en porte le TEXTE. Une référence pointe
 * vers un document qui sera régénéré la semaine prochaine, corrigé le mois
 * suivant, et qui ne dira plus ce que le recruteur a lu. La seule preuve qui
 * tient est une copie figée au moment de l'envoi.
 *
 * Même chose pour le cran d'autonomie : le relire aujourd'hui sur le profil
 * donnerait le cran d'aujourd'hui, qui n'explique rien de la décision d'hier.
 */

import type pg from 'pg'
import type { Canal } from '@job-seeker/profil'
import type { Dossier } from '../envoi/dossier.ts'

export type Recu = {
  readonly profileId: string
  readonly opportuniteId: string
  readonly canal: Canal
  readonly cvTexte: string
  readonly messageTexte: string | null
  readonly cranAuMoment: string
  readonly mandatId: string | null
  readonly resultat: string
}

/**
 * Extrait du dossier ce qui est PARTI.
 *
 * Le CV et la lettre sont deux pièces distinctes ; les concaténer pour tenir
 * dans une colonne rendrait le reçu illisible et ferait perdre la frontière
 * entre les deux. Le CV va dans `cv_texte`, le reste — lettre et réponses de
 * screening — dans `message_texte`, séparé et nommé.
 */
export function depuisDossier(
  d: Dossier,
  p: {
    profileId: string
    opportuniteId: string
    cranAuMoment: string
    mandatId: string | null
    resultat: string
  },
): Recu {
  const cv = d.pieces.find((x) => x.nature === 'cv')
  const autres = d.pieces.filter((x) => x.nature !== 'cv')
  return {
    profileId: p.profileId,
    opportuniteId: p.opportuniteId,
    canal: d.canal,
    // Un reçu sans CV n'est pas un reçu allégé : c'est un reçu faux. On préfère
    // une chaîne vide EXPLICITE à une colonne absente, et la réconciliation
    // ci-après la signalera.
    cvTexte: cv?.contenu ?? '',
    messageTexte:
      autres.length === 0
        ? null
        : autres.map((x) => `## ${x.intitule}\n\n${x.contenu}`).join('\n\n'),
    cranAuMoment: p.cranAuMoment,
    mandatId: p.mandatId,
    resultat: p.resultat,
  }
}

/**
 * Écrit le reçu. Ne gère PAS de transaction : l'appelant en tient déjà une, et
 * c'est le point — le reçu et l'état de l'envoi doivent tomber ensemble.
 *
 * Un `begin` ici en ouvrirait une seconde, imbriquée, dont le `commit`
 * validerait la moitié du travail de l'appelant. C'est la façon la plus
 * discrète de casser une atomicité qu'on croit avoir.
 */
export async function ecrireRecu(db: pg.Client | pg.Pool, r: Recu): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.recus
       (profile_id, opportunite_id, canal, cv_texte, message_texte,
        cran_au_moment, mandat_id, resultat)
     values ($1, $2, $3, $4, $5, $6::public.cran_autonomie, $7, $8)
     returning id`,
    [
      r.profileId, r.opportuniteId, r.canal, r.cvTexte, r.messageTexte,
      r.cranAuMoment, r.mandatId, r.resultat,
    ],
  )
  const id = rows[0]?.id
  if (id === undefined) throw new Error('reçu non écrit — l’insertion n’a rien rendu')
  return id
}
