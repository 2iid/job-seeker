import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, creerCompte } from '@job-seeker/testing'

/**
 * JOB-038 — le cloisonnement là où il compte.
 *
 * Une offre est une annonce PUBLIQUE : la cloisonner par profil dupliquerait la
 * même ligne autant de fois qu'il y a de candidats, sans rien protéger que le
 * monde ne sache déjà.
 *
 * Ce qui est personnel, c'est le LIEN entre une personne et une offre. Savoir
 * quelles offres quelqu'un s'est vu proposer — et lesquelles il a écartées —
 * en dit long sur lui : son niveau, ses prétentions, sa mobilité, et parfois
 * qu'il cherche un poste sans que son employeur le sache.
 */

let c: pg.Client
let alice: string
let bob: string
let profilAlice: string
let profilBob: string
let offre: string

const profilDe = async (u: string): Promise<string> =>
  (await c.query<{ id: string }>('select id from public.profiles where user_id = $1', [u])).rows[0]!.id

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@oppo.test'")
  await c.query("delete from public.offres where source = 'test-oppo'")
  alice = await creerCompte(c, 'alice@oppo.test')
  bob = await creerCompte(c, 'bob@oppo.test')
  profilAlice = await profilDe(alice)
  profilBob = await profilDe(bob)

  offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature)
     values ('test-oppo', 'a', 'X1', 'qonto', 'Qonto', 'Product Manager', 'https://x.test/1')
     returning id`,
  )).rows[0]!.id

  for (const p of [profilAlice, profilBob]) {
    await c.query(
      'insert into public.opportunites (profile_id, offre_id, score) values ($1, $2, $3)',
      [p, offre, p === profilAlice ? 78 : 41],
    )
  }
}, 40_000)

afterAll(async () => {
  await c.query("delete from public.offres where source = 'test-oppo'")
  await c.query("delete from auth.users where email like '%@oppo.test'")
  await c.end()
})

describe('offres — publiques, parce qu’elles le sont', () => {
  it('toute personne authentifiée lit une offre', async () => {
    const { rows } = await asUser(c, bob, (x) =>
      x.query('select titre from public.offres where id = $1', [offre]),
    )
    expect(rows).toHaveLength(1)
  })

  it('personne ne les ÉCRIT depuis un client — le moteur écrit, l’interface lit', async () => {
    // Une personne qui pourrait insérer une offre se fabriquerait une annonce
    // que rien n'a relevée, avec la fraîcheur qu'elle choisit.
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                      employeur_affiche, titre, url_candidature)
           values ('faux', 'a', 'Z', 'z', 'Z', 'Z', 'https://z.test')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('un visiteur non authentifié ne lit rien', async () => {
    await expect(asAnon(c, (x) => x.query('select 1 from public.offres'))).rejects.toThrow(
      /permission denied/i,
    )
  })
})

describe('opportunites — c’est LÀ que le cloisonnement mord', () => {
  it('Alice ne voit que ses propres scores', async () => {
    const { rows } = await asUser(c, alice, (x) =>
      x.query<{ profile_id: string; score: number }>('select profile_id, score from public.opportunites'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.profile_id).toBe(profilAlice)
    expect(rows[0]!.score).toBe(78)
  })

  it('Bob ne voit pas le score d’Alice sur la MÊME offre', async () => {
    // Le cas qui compte : la ligne d'à côté porte le même `offre_id`. Une
    // politique qui cloisonnerait par offre au lieu du profil laisserait tout
    // passer sans que rien n'ait l'air anormal.
    const { rows } = await asUser(c, bob, (x) =>
      x.query('select score from public.opportunites where offre_id = $1', [offre]),
    )
    expect(rows.map((r: { score: number }) => r.score)).toEqual([41])
  })

  it('personne ne s’INVENTE une opportunité', async () => {
    // Elle se proposerait une offre que rien n'a jugée, avec le score de son
    // choix — et l'agent la traiterait comme un verdict du moteur.
    await expect(
      asUser(c, alice, (x) =>
        x.query('insert into public.opportunites (profile_id, offre_id, score) values ($1, $2, 100)', [
          profilAlice, offre,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('Alice peut changer le STATUT de la sienne, jamais de celle de Bob', async () => {
    // `en-file` et non `ecartee` : depuis JOB-048, une opportunité écartée doit
    // PORTER SON MOTIF (contrainte `refus_porte_son_motif`), sans quoi REQ-006
    // — apprendre des refus — n'aurait rien à lire. Ce test parle de
    // cloisonnement, pas de refus : il n'a aucune raison de choisir ce
    // statut-là.
    const { rowCount: sienne } = await asUser(c, alice, (x) =>
      x.query("update public.opportunites set statut = 'en-file' where profile_id = $1", [profilAlice]),
    )
    expect(sienne).toBe(1)

    const { rowCount: autrui } = await asUser(c, alice, (x) =>
      x.query("update public.opportunites set statut = 'en-file' where profile_id = $1", [profilBob]),
    )
    expect(autrui).toBe(0)
  })

  it('une opportunité écartée DOIT porter son motif', async () => {
    // La contrainte est en base parce qu'un refus sans motif n'écarte qu'une
    // offre, là où un refus AVEC motif corrige la recherche. Trois refus
    // « salaire » veulent dire que le seuil est mal réglé.
    await expect(
      asUser(c, alice, (x) =>
        x.query("update public.opportunites set statut = 'ecartee' where profile_id = $1", [profilAlice]),
      ),
    ).rejects.toThrow(/refus_porte_son_motif/)

    const { rowCount } = await asUser(c, alice, (x) =>
      x.query(
        "update public.opportunites set statut = 'ecartee', motif_refus = 'lieu' where profile_id = $1",
        [profilAlice],
      ),
    )
    expect(rowCount).toBe(1)
  })

  it('un visiteur non authentifié ne voit rien', async () => {
    await expect(asAnon(c, (x) => x.query('select 1 from public.opportunites'))).rejects.toThrow(
      /permission denied/i,
    )
  })
})

describe('recherches sauvegardées — l’outil de travail de la personne', () => {
  it('elle la crée, la relit et la supprime', async () => {
    // Une recherche est un outil, pas une trace : contrairement à
    // `opportunites`, elle s'écrit et s'efface depuis le client.
    await asUser(c, alice, async (x) => {
      await x.query(
        `insert into public.recherches_sauvegardees (profile_id, nom, filtres, actif)
         values ($1, 'Dakar distanciel', '{"palier":["a"]}'::jsonb, true)`,
        [profilAlice],
      )
      const { rows } = await x.query('select nom from public.recherches_sauvegardees')
      expect(rows).toHaveLength(1)
      const { rowCount } = await x.query('delete from public.recherches_sauvegardees where profile_id = $1', [profilAlice])
      expect(rowCount).toBe(1)
    })
  })

  it('Bob n’en crée pas dans le profil d’Alice', async () => {
    await expect(
      asUser(c, bob, (x) =>
        x.query(
          "insert into public.recherches_sauvegardees (profile_id, nom) values ($1, 'intrusion')",
          [profilAlice],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('un seul filtre actif par profil — deux se contrediraient', async () => {
    await c.query(
      `insert into public.recherches_sauvegardees (profile_id, nom, actif)
       values ($1, 'un', true)`, [profilAlice],
    )
    await expect(
      c.query(
        `insert into public.recherches_sauvegardees (profile_id, nom, actif)
         values ($1, 'deux', true)`, [profilAlice],
      ),
    ).rejects.toThrow(/unique|duplicate/i)
    await c.query('delete from public.recherches_sauvegardees where profile_id = $1', [profilAlice])
  })
})
