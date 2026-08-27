import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'
import { enregistrer } from '../../apps/worker/src/envoi/enregistrer.ts'

/**
 * JOB-049 — le dossier préparé contient le CV et la lettre. C'est donc, en
 * volume, la deuxième concentration de données personnelles du produit après le
 * profil lui-même — et la première que le support ait une raison plausible de
 * vouloir regarder (« je veux juste voir ce qui a été préparé »).
 */
let c: pg.Client
let alice: string
let bob: string
let profilAlice: string
let opportunite: string
let dossier: string

const commeSupport = async <T>(fn: (x: pg.Client) => Promise<T>): Promise<T> => {
  await c.query('begin')
  try {
    await c.query('set local role support')
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
}

beforeAll(async () => {
  c = await admin()
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@dossiers.test'")
  alice = await creerCompte(c, 'alice@dossiers.test')
  bob = await creerCompte(c, 'bob@dossiers.test')
  const profil = async (u: string) =>
    (await c.query<{ id: string }>('select id from public.profiles where user_id = $1', [u]))
      .rows[0]!.id
  profilAlice = await profil(alice)

  const offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature)
     values ('test', 'a', 'ref-dossier-1', 'exemple', 'Exemple', 'Infirmier',
             'https://exemple.fr/1') returning id`,
  )).rows[0]!.id
  opportunite = (await c.query<{ id: string }>(
    `insert into public.opportunites (profile_id, offre_id, statut)
     values ($1, $2, 'prete-a-envoyer') returning id`, [profilAlice, offre],
  )).rows[0]!.id
  dossier = (await c.query<{ id: string }>(
    `insert into public.dossiers (profile_id, opportunite_id, canal, pieces, pret, issue)
     values ($1, $2, 'ats', $3::jsonb, true, 'prepare') returning id`,
    [profilAlice, opportunite, JSON.stringify([{ nature: 'cv', contenu: 'CV CONFIDENTIEL D ALICE' }])],
  )).rows[0]!.id
}, 30_000)

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@dossiers.test'")
  await c.query("delete from public.offres where identifiant_source = 'ref-dossier-1'")
  await c.end()
})

describe('le statut que l’ADR-0003 a rendu nécessaire', () => {
  it('« prete-a-envoyer » existe et n’est pas « envoyee »', async () => {
    const { rows } = await c.query<{ statut: string }>(
      'select statut::text as statut from public.opportunites where id = $1', [opportunite])
    expect(rows[0]!.statut).toBe('prete-a-envoyer')
  })

  it('« incertaine » est distinct de « echec-technique »', async () => {
    // Les confondre ferait disparaître la seule information qui compte pour la
    // personne : faut-il aller vérifier ?
    const { rows } = await c.query<{ v: string }>(
      `select unnest(enum_range(null::public.statut_opportunite))::text as v`)
    const vals = rows.map((r) => r.v)
    expect(vals).toContain('incertaine')
    expect(vals).toContain('echec-technique')
  })
})

describe('dossiers — lecture', () => {
  it('ALLOW : Alice lit son propre dossier', async () => {
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select id from public.dossiers where id = $1', [dossier]))
    expect(rows).toHaveLength(1)
  })

  it('DENY : Bob ne voit AUCUNE ligne d’Alice', async () => {
    const { rows } = await asUser(c, bob, (x) => x.query('select id from public.dossiers'))
    expect(rows).toHaveLength(0)
  })

  it('DENY : un visiteur anonyme est refusé par PRIVILÈGE, pas par politique', async () => {
    // Plus fort que « zéro ligne » : `anon` n'a aucun droit sur cette table,
    // donc la requête n'atteint jamais la RLS. Deux barrières valent mieux
    // qu'une, et celle-ci ne dépend d'aucune politique bien écrite.
    await c.query('begin')
    try {
      await c.query('set local role anon')
      await expect(c.query('select id from public.dossiers')).rejects.toThrow(/permission denied/i)
    } finally { await c.query('rollback') }
  })
})

describe('dossiers — écriture', () => {
  it('DENY : personne ne s’écrit un dossier « prêt » à soi-même', async () => {
    // C'est le test qui protège le SENS du statut. Si un client pouvait
    // insérer `pret = true`, le mot ne certifierait plus rien.
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          `insert into public.dossiers (profile_id, opportunite_id, canal, pret)
           values ($1, $2, 'email', true)`, [profilAlice, opportunite])),
    ).rejects.toThrow(/permission denied|violates row-level/i)
  })

  it('DENY : ni modifier, ni supprimer le sien', async () => {
    for (const sql of [
      'update public.dossiers set pret = true where id = $1',
      'delete from public.dossiers where id = $1',
    ])
      await expect(asUser(c, alice, (x) => x.query(sql, [dossier])), sql)
        .rejects.toThrow(/permission denied|violates row-level/i)
  })

  it('DENY : Bob ne s’attribue pas le profil d’Alice', async () => {
    await expect(
      asUser(c, bob, (x) =>
        x.query(
          `insert into public.dossiers (profile_id, opportunite_id, canal) values ($1, $2, 'email')`,
          [profilAlice, opportunite])),
    ).rejects.toThrow(/permission denied|violates row-level/i)
  })
})

describe('REQ-014 — le support voit l’état, jamais le contenu', () => {
  it('ALLOW : il voit qu’un dossier existe et où il en est', async () => {
    const { rows } = await commeSupport((x) =>
      x.query<{ pret: boolean; issue: string }>(
        'select pret, issue from public.dossiers where id = $1', [dossier]))
    expect(rows[0]!.pret).toBe(true)
    expect(rows[0]!.issue).toBe('prepare')
  })

  it('DENY : `pieces` lui est refusé PAR POSTGRES, pas par l’application', async () => {
    await expect(
      commeSupport((x) => x.query('select pieces from public.dossiers where id = $1', [dossier])),
    ).rejects.toThrow(/permission denied/i)
  })

  it('DENY : `select *` ne contourne pas la restriction de colonne', async () => {
    // L'échappatoire évidente, et celle qu'on écrit sans y penser dans une
    // console un soir d'incident.
    await expect(
      commeSupport((x) => x.query('select * from public.dossiers where id = $1', [dossier])),
    ).rejects.toThrow(/permission denied/i)
  })

  it('DENY : il n’écrit rien', async () => {
    await expect(
      commeSupport((x) => x.query('update public.dossiers set pret = false where id = $1', [dossier])),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('enregistrer — le dossier et le statut, ou ni l’un ni l’autre', () => {
  it('écrit les deux ensemble', async () => {
    await enregistrer(c, {
      profileId: profilAlice, opportuniteId: opportunite, canal: 'email',
      dossier: { opportuniteId: opportunite, canal: 'email', pieces: [], questionsSansReponse: [] },
      etat: { pret: true },
      issue: { type: 'envoye', adresse: 'a@exemple.fr', confirmation: { reference: 'r', recuLe: '2026-08-27T10:00:00Z' } },
      destinationProvenance: 'contact-enregistre',
    })
    const { rows } = await c.query<{ statut: string; issue: string }>(
      `select o.statut::text as statut, d.issue
         from public.opportunites o join public.dossiers d on d.opportunite_id = o.id
        where o.id = $1 and d.canal = 'email'`, [opportunite])
    expect(rows[0]).toEqual({ statut: 'envoyee', issue: 'envoye' })

    // REQ-011 : « une soumission réussie enregistre la confirmation obtenue ».
    // Elle n'est donnée qu'UNE fois — le destinataire ne la répétera pas.
    const preuve = await c.query<{ reference: string; adresse: string }>(
      `select confirmation_reference as reference, destination_adresse as adresse
         from public.dossiers where opportunite_id = $1 and canal = 'email'`, [opportunite])
    expect(preuve.rows[0]).toEqual({ reference: 'r', adresse: 'a@exemple.fr' })
  })

  it('refuse un dossier rattaché à une opportunité inexistante', async () => {
    // Ce test s'appelait « ne laisse rien quand l'écriture du statut échoue »
    // et ne prouvait PAS cela : la clé étrangère fait échouer le premier ordre,
    // donc le retour arrière n'était jamais exercé — il n'y avait rien à
    // annuler. Il vérifie maintenant ce qu'il vérifiait réellement, et le
    // retour arrière est prouvé dans enregistrer.test.ts, sur un client feint
    // dont le SECOND ordre échoue.
    await expect(
      enregistrer(c, {
        profileId: profilAlice,
        opportuniteId: '00000000-0000-0000-0000-000000000000',
        canal: 'email',
        dossier: { opportuniteId: 'x', canal: 'email', pieces: [], questionsSansReponse: [] },
        etat: { pret: true },
        issue: { type: 'prepare', annonce: '', pret: true },
      }),
    ).rejects.toThrow(/foreign key/i)
  })

  it('rejouer la même préparation met à JOUR, sans doubler la ligne', async () => {
    // La contrainte d’unicité (opportunite_id, canal) est ce qui rendra
    // l’idempotence de JOB-051 possible sans table supplémentaire.
    const params = {
      profileId: profilAlice, opportuniteId: opportunite, canal: 'ats' as const,
      dossier: { opportuniteId: opportunite, canal: 'ats' as const, pieces: [], questionsSansReponse: [] },
      etat: { pret: true as const },
      issue: { type: 'prepare' as const, annonce: '', pret: true },
    }
    await enregistrer(c, params)
    await enregistrer(c, params)
    const { rows } = await c.query<{ n: number }>(
      "select count(*)::int as n from public.dossiers where opportunite_id = $1 and canal = 'ats'",
      [opportunite])
    expect(rows[0]!.n).toBe(1)
  })
})

describe('la contrainte de cohérence de la confirmation', () => {
  it('REFUSE un dossier « envoyé » sans confirmation ni destinataire', async () => {
    // C'est la ligne qu'on lira le jour d'un litige. Une écriture partielle qui
    // passerait pour un envoi serait pire qu'une absence d'écriture : elle
    // affirmerait quelque chose qu'on ne peut pas prouver.
    await expect(
      c.query(
        `insert into public.dossiers (profile_id, opportunite_id, canal, issue)
         values ($1, $2, 'formulaire', 'envoye')`, [profilAlice, opportunite]),
    ).rejects.toThrow(/dossiers_confirmation_coherente/)
  })

  it('accepte un dossier « préparé » sans confirmation — c’est le cas normal', async () => {
    await c.query(
      `insert into public.dossiers (profile_id, opportunite_id, canal, issue)
       values ($1, $2, 'formulaire', 'prepare')`, [profilAlice, opportunite])
    const { rowCount } = await c.query(
      "select 1 from public.dossiers where opportunite_id = $1 and canal = 'formulaire'",
      [opportunite])
    expect(rowCount).toBe(1)
  })

  it('REFUSE une provenance de destination inventée', async () => {
    await expect(
      c.query(
        `insert into public.dossiers (profile_id, opportunite_id, canal, destination_provenance)
         values ($1, $2, 'email', 'texte-de-l-annonce')`, [profilAlice, opportunite]),
    ).rejects.toThrow(/destination_provenance/)
  })
})

describe('F27 — un dossier ne peut pas être rattaché à la mauvaise personne', () => {
  it('REFUSE un dossier dont le profil ne correspond pas à l’opportunité', async () => {
    // Le worker écrit avec service_role, qui contourne la RLS. Deux paramètres
    // incohérents suffisaient donc à créer un dossier contenant le CV et la
    // lettre d'Alice, mais VISIBLE PAR BOB — la politique de lecture s'appuie
    // sur profile_id, le contenu appartient à l'opportunité.
    // Nettoyer d'abord : sinon c'est la contrainte d'unicité qui parle, et le
    // test passerait pour la mauvaise raison.
    await c.query("delete from public.dossiers where canal = 'email'")
    const profilBob = (await c.query<{ id: string }>(
      'select id from public.profiles where user_id = $1', [bob])).rows[0]!.id
    await expect(
      c.query(
        `insert into public.dossiers (profile_id, opportunite_id, canal)
         values ($1, $2, 'email')`, [profilBob, opportunite]),
    ).rejects.toThrow(/dossiers_appartiennent_a_leur_opportunite/)
  })

  it('et accepte le bon', async () => {
    await c.query("delete from public.dossiers where canal = 'email'")
    const { rowCount } = await c.query(
      `insert into public.dossiers (profile_id, opportunite_id, canal)
       values ($1, $2, 'email')`, [profilAlice, opportunite])
    expect(rowCount).toBe(1)
  })
})
