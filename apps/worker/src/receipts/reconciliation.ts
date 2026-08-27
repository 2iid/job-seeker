/**
 * JOB-055 — « une action sans reçu est un incident : le produit ALERTE plutôt
 * que de laisser un trou ».
 *
 * ── Pourquoi vérifier une invariante qu'on vient d'écrire ──
 *
 * `enregistrer()` écrit l'état de l'envoi et son reçu dans la même transaction.
 * En principe, ils ne peuvent donc pas diverger. En principe.
 *
 * Une atomicité qu'on n'observe jamais est un commentaire. La première des
 * trois recherches ci-dessous ne cherche donc pas un bogue connu : elle vérifie
 * que la promesse tient encore, et elle est la seule chose qui le dira le jour
 * où quelqu'un ajoutera un `commit` de trop.
 */

import type pg from 'pg'

export type GenreIncident = 'action-sans-preuve' | 'envoi-sans-recu' | 'recu-orphelin'

/**
 * Le titre d'une annonce est du CONTENU RÉCUPÉRÉ : n'importe qui peut publier
 * une offre, donc n'importe qui peut choisir ce texte. Il apparaît ici dans un
 * message que la personne lira au moment où elle est déjà inquiète — le
 * meilleur moment pour lui glisser « appelez le 06… pour confirmer ».
 *
 * On ne peut pas s'en passer : sans intitulé, l'incident ne dit pas DE QUOI il
 * parle. On le borne donc — longueur, retours à la ligne, caractères de
 * contrôle — pour qu'il reste une étiquette et ne devienne pas un message.
 */
export function intituleSur(brut: string): string {
  const propre = brut
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return propre.length <= 80 ? propre : `${propre.slice(0, 79)}\u2026`
}

export type Incident = {
  readonly profileId: string
  readonly opportuniteId: string
  readonly genre: GenreIncident
  readonly constat: string
  readonly conduite: string
}

export type Bilan = {
  readonly ouverts: number
  readonly deja: number
  readonly genres: Readonly<Partial<Record<GenreIncident, number>>>
}

/**
 * Cherche les trous. Rend les incidents CONSTATÉS, sans les écrire — pour que
 * la recherche soit testable sans effets, et que l'écriture soit un geste
 * séparé qu'on peut refuser.
 */
export async function chercherTrous(db: pg.Client | pg.Pool): Promise<Incident[]> {
  const out: Incident[] = []

  // 1. Une réclamation abandonnée : le worker est mort entre l'envoi et
  //    l'écriture. C'est le trou RÉEL, celui que la conception laisse exister.
  const abandonnees = await db.query<{ profile_id: string; opportunite_id: string; titre: string }>(
    `select d.profile_id, d.opportunite_id, o.titre
       from public.dossiers d
       join public.opportunites op on op.id = d.opportunite_id
       join public.offres o on o.id = op.offre_id
      where d.issue = 'en-cours' and d.bail_jusqu_a < now()`,
  )
  for (const r of abandonnees.rows) {
    out.push({
      profileId: r.profile_id,
      opportuniteId: r.opportunite_id,
      genre: 'action-sans-preuve',
      constat:
        `Une candidature à « ${intituleSur(r.titre)} » a été interrompue au moment de l’envoi. ` +
        'Je ne peux pas dire si elle est partie.',
      conduite:
        'Regardez vos messages envoyés, ou l’espace candidat de cet employeur. ' +
        'Dites-moi ensuite si je dois candidater ou classer sans suite — je ne recommence pas seul.',
    })
  }

  // 2. Un envoi enregistré SANS reçu. L'invariant de transaction, vérifié.
  const sansRecu = await db.query<{ profile_id: string; opportunite_id: string; titre: string }>(
    `select d.profile_id, d.opportunite_id, o.titre
       from public.dossiers d
       join public.opportunites op on op.id = d.opportunite_id
       join public.offres o on o.id = op.offre_id
      where d.issue = 'envoye'
        and not exists (
          select 1 from public.recus r
           where r.opportunite_id = d.opportunite_id and r.canal = d.canal
             -- Un recu au CV VIDE ne compte pas comme un recu. « Le CV exact »
             -- dit REQ-013 : une colonne vide est une preuve qui n'en est pas,
             -- et elle serait pire que rien puisqu'elle a l'air d'exister.
             and length(btrim(r.cv_texte)) > 0
        )`,
  )
  for (const r of sansRecu.rows) {
    out.push({
      profileId: r.profile_id,
      opportuniteId: r.opportunite_id,
      genre: 'envoi-sans-recu',
      constat:
        `Une candidature à « ${intituleSur(r.titre)} » est partie, mais je n’en ai pas gardé la preuve exacte. ` +
        'C’est un défaut de ma part, pas du vôtre.',
      conduite:
        'Le contenu envoyé n’est plus reconstituable à l’identique. ' +
        'Si vous avez besoin de savoir ce que le recruteur a reçu, demandez-le-lui.',
    })
  }

  // 3. Un reçu sans envoi correspondant. L'anomalie inverse, et elle compte
  //    autant : un reçu qui affirme un envoi qui n'a pas eu lieu est un
  //    mensonge dans la seule table censée ne pas mentir.
  const orphelins = await db.query<{ profile_id: string; opportunite_id: string }>(
    `select r.profile_id, r.opportunite_id
       from public.recus r
      where r.opportunite_id is not null
        and r.resultat = 'envoye'
        and not exists (
          select 1 from public.dossiers d
           where d.opportunite_id = r.opportunite_id and d.canal = r.canal
             and d.issue = 'envoye'
        )`,
  )
  for (const r of orphelins.rows) {
    out.push({
      profileId: r.profile_id,
      opportuniteId: r.opportunite_id,
      genre: 'recu-orphelin',
      constat: 'J’ai la preuve d’un envoi dont je ne retrouve pas la trace côté candidature.',
      conduite: 'Aucune action de votre part : je le signale pour que ce soit examiné.',
    })
  }

  return out
}

/**
 * Écrit les incidents constatés.
 *
 * `on conflict do nothing` : la réconciliation tourne en boucle. Sans cela, la
 * même alerte s'empilerait à chaque tour, et une liste de deux cents lignes
 * identiques n'alerte plus personne — elle enterre.
 */
export async function ouvrirIncidents(
  db: pg.Client | pg.Pool,
  incidents: readonly Incident[],
): Promise<Bilan> {
  const genres: Partial<Record<GenreIncident, number>> = {}
  let ouverts = 0
  for (const i of incidents) {
    const { rowCount } = await db.query(
      `insert into public.incidents (profile_id, opportunite_id, genre, constat, conduite)
       values ($1, $2, $3, $4, $5)
       on conflict (opportunite_id, genre) do nothing`,
      [i.profileId, i.opportuniteId, i.genre, i.constat, i.conduite],
    )
    if ((rowCount ?? 0) > 0) {
      ouverts += 1
      genres[i.genre] = (genres[i.genre] ?? 0) + 1
    }
  }
  return { ouverts, deja: incidents.length - ouverts, genres }
}

export async function reconcilier(db: pg.Client | pg.Pool): Promise<Bilan> {
  return ouvrirIncidents(db, await chercherTrous(db))
}

/** Clore un incident. Il ne s'efface pas : « fausse alerte » est une information. */
export async function clore(
  db: pg.Client | pg.Pool,
  p: { incidentId: string; par: string; motif: string },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `update public.incidents
        set clos_le = now(), clos_par = $2, clos_motif = $3
      where id = $1 and clos_le is null`,
    [p.incidentId, p.par, p.motif],
  )
  return (rowCount ?? 0) > 0
}
