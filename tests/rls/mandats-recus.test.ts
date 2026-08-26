import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, creerCompte } from '@job-seeker/testing'

/**
 * JOB-046 / JOB-054 — le consentement et la preuve, contre la vraie base.
 *
 * Deux garanties de nature différente :
 *
 * · Un MANDAT s'accorde et se révoque par son propriétaire — c'est son
 *   consentement, il ne se donne pas à sa place. Mais il ne se MODIFIE pas :
 *   « depuis quand l'agent avait-il le droit d'envoyer ici ? » ne doit pas
 *   dépendre de la dernière écriture.
 *
 * · Un REÇU ne s'écrit pas depuis un client — un reçu qu'on peut fabriquer ne
 *   prouve rien — et ne se modifie par PERSONNE, worker compris. C'est
 *   pourquoi la garantie est un déclencheur et non une politique :
 *   `service_role` contourne la RLS, et c'est justement le rôle du worker.
 */

let c: pg.Client
let alice: string
let bob: string
let profilAlice: string
let profilBob: string

const profilDe = async (u: string): Promise<string> =>
  (await c.query<{ id: string }>('select id from public.profiles where user_id = $1', [u])).rows[0]!.id

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@mandat.test'")
  alice = await creerCompte(c, 'alice@mandat.test')
  bob = await creerCompte(c, 'bob@mandat.test')
  profilAlice = await profilDe(alice)
  profilBob = await profilDe(bob)
}, 40_000)

afterAll(async () => {
  // Le nettoyage emprunte le même chemin que le parcours d'effacement : c'est
  // le seul qui existe, et c'est bien qu'il n'y en ait pas d'autre.
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@mandat.test'")
  await c.end()
})

describe('mandats — le consentement ne se donne pas à sa place', () => {
  it('Alice accorde le sien', async () => {
    await asUser(c, alice, async (x) => {
      const { rowCount } = await x.query(
        `insert into public.mandats (profile_id, canal, cran, apercu_empreinte, expire_le)
         values ($1, 'ats', 'agir-seul', 'sha256-abc', now() + interval '90 days')`,
        [profilAlice],
      )
      expect(rowCount).toBe(1)
    })
  })

  it('Alice n’en accorde PAS un dans le profil de Bob', async () => {
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          `insert into public.mandats (profile_id, canal, cran, apercu_empreinte, expire_le)
           values ($1, 'ats', 'agir-seul', 'x', now() + interval '1 day')`,
          [profilBob],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('un mandat ne se MODIFIE pas — on en écrit un nouveau', async () => {
    await c.query(
      `insert into public.mandats (profile_id, canal, cran, apercu_empreinte, expire_le)
       values ($1, 'email', 'agir-seul', 'x', now() + interval '1 day')`,
      [profilAlice],
    )
    await expect(
      asUser(c, alice, (x) =>
        x.query("update public.mandats set cran = 'observer' where profile_id = $1", [profilAlice]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('« agir-seul » sans APERÇU ni ÉCHÉANCE est refusé par la base', async () => {
    // REQ-009 : l'octroi doit être précédé d'un aperçu intégral de ce qui sera
    // envoyé. Un mandat mal formé est exactement ce qu'on ne veut pas
    // découvrir au moment de s'en servir.
    await expect(
      c.query(
        "insert into public.mandats (profile_id, canal, cran) values ($1, 'formulaire', 'agir-seul')",
        [profilAlice],
      ),
    ).rejects.toThrow(/mandat_agir_seul_complet/)
  })

  it('les crans inférieurs n’exigent rien — ils n’autorisent aucun envoi', async () => {
    const { rowCount } = await c.query(
      "insert into public.mandats (profile_id, canal, cran) values ($1, 'formulaire', 'proposer')",
      [profilAlice],
    )
    expect(rowCount).toBe(1)
  })

  it('Bob ne lit pas les mandats d’Alice', async () => {
    const { rows } = await asUser(c, bob, (x) => x.query('select id from public.mandats'))
    expect(rows).toEqual([])
  })
})

describe('reçus — immuables pour TOUT LE MONDE', () => {
  let recu: string

  it('le worker en écrit un', async () => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.recus (profile_id, canal, cv_texte, cran_au_moment, resultat)
       values ($1, 'ats', 'CV envoyé', 'agir-seul', 'accepte') returning id`,
      [profilAlice],
    )
    recu = rows[0]!.id
    expect(recu).toBeTruthy()
  })

  it('la personne le LIT', async () => {
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select cv_texte from public.recus where id = $1', [recu]),
    )
    expect(rows[0]).toMatchObject({ cv_texte: 'CV envoyé' })
  })

  it('elle ne l’ÉCRIT pas — un reçu qu’on peut fabriquer ne prouve rien', async () => {
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          `insert into public.recus (profile_id, canal, cv_texte, cran_au_moment, resultat)
           values ($1, 'ats', 'faux', 'agir-seul', 'accepte')`,
          [profilAlice],
        ),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('PERSONNE ne le modifie — pas même la connexion superutilisateur', async () => {
    // C'est le test qui compte. Une politique RLS ne suffirait pas :
    // `service_role` la contourne, et c'est le rôle du worker. La garantie est
    // un déclencheur, qui s'applique à tout le monde.
    await expect(
      c.query("update public.recus set resultat = 'refuse' where id = $1", [recu]),
    ).rejects.toThrow(/ne se modifie pas/i)
  })

  it('et on ne le SUPPRIME pas non plus, hors parcours d’effacement', async () => {
    await expect(c.query('delete from public.recus where id = $1', [recu]))
      .rejects.toThrow(/ne se modifie pas/i)
  })

  it('mais le droit d’EFFACER ses données reste possible (REQ-014)', async () => {
    // La première version du déclencheur refusait toute suppression, à tout le
    // monde — et rendait donc la suppression de compte impossible. Deux
    // exigences se rencontrent ici et ne se contredisent qu'en apparence :
    // REQ-013 protège de la CORRECTION SILENCIEUSE, REQ-014 protège le DROIT
    // D'EFFACER. Le drapeau rend l'intention lisible dans le code qui l'emploie.
    await c.query('begin')
    await c.query("select set_config('app.suppression_compte', 'true', true)")
    const { rowCount } = await c.query('delete from public.recus where id = $1', [recu])
    expect(rowCount).toBe(1)
    await c.query('rollback')
  })

  it('le drapeau n’autorise PAS pour autant la modification', async () => {
    // Sinon il serait une porte dérobée : « je supprime » deviendrait « je
    // corrige », et l'immuabilité ne vaudrait plus rien.
    await c.query('begin')
    await c.query("select set_config('app.suppression_compte', 'true', true)")
    await expect(
      c.query("update public.recus set resultat = 'refuse' where id = $1", [recu]),
    ).rejects.toThrow(/ne se modifie pas/i)
    await c.query('rollback')
  })

  it('Bob ne lit pas les reçus d’Alice', async () => {
    const { rows } = await asUser(c, bob, (x) => x.query('select id from public.recus'))
    expect(rows).toEqual([])
  })

  it('un visiteur non authentifié ne voit ni mandats ni reçus', async () => {
    await expect(asAnon(c, (x) => x.query('select 1 from public.mandats'))).rejects.toThrow(/permission denied/i)
    await expect(asAnon(c, (x) => x.query('select 1 from public.recus'))).rejects.toThrow(/permission denied/i)
  })
})

describe('arrêt d’urgence et quotas — les défauts de la base', () => {
  it('un profil neuf n’est pas en arrêt, et a un quota borné', async () => {
    const { rows } = await c.query<{
      arret_urgence_le: string | null; quota_quotidien: number
      plage_debut_minutes: number; plage_fin_minutes: number
    }>(
      `select arret_urgence_le, quota_quotidien, plage_debut_minutes, plage_fin_minutes
       from public.profiles where id = $1`, [profilAlice],
    )
    const p = rows[0]!
    expect(p.arret_urgence_le).toBeNull()
    // Un quota par défaut ILLIMITÉ serait un défaut permissif de plus.
    expect(p.quota_quotidien).toBeGreaterThan(0)
    expect(p.quota_quotidien).toBeLessThanOrEqual(20)
    expect(p.plage_debut_minutes).toBe(8 * 60)
    expect(p.plage_fin_minutes).toBe(19 * 60)
  })

  it('la base refuse un quota aberrant', async () => {
    await expect(
      c.query('update public.profiles set quota_quotidien = 5000 where id = $1', [profilAlice]),
    ).rejects.toThrow(/quota_quotidien/)
  })

  it('la personne déclenche SON arrêt d’urgence, et seulement le sien', async () => {
    const { rowCount: sien } = await asUser(c, alice, (x) =>
      x.query('update public.profiles set arret_urgence_le = now() where id = $1', [profilAlice]),
    )
    expect(sien).toBe(1)
    const { rowCount: autrui } = await asUser(c, alice, (x) =>
      x.query('update public.profiles set arret_urgence_le = now() where id = $1', [profilBob]),
    )
    expect(autrui).toBe(0)
  })
})
