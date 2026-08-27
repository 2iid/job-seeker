import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'
import type { EtatEnvoi } from '@job-seeker/profil'
import { traiterEnvoi } from '../../apps/worker/src/envoi/traiter.ts'
import { verifierDestination } from '../../apps/worker/src/envoi/destination.ts'
import type { Transport } from '../../apps/worker/src/envoi/envoyer.ts'
import { reclamer } from '../../apps/worker/src/envoi/idempotence.ts'
import { chercherTrous, clore, reconcilier } from '../../apps/worker/src/receipts/reconciliation.ts'

/**
 * JOB-055 / REQ-013 — le reçu, et le trou.
 *
 * L'immutabilité du reçu est déjà couverte par mandats-recus.test.ts. Ce
 * fichier vérifie les deux choses qui manquaient : qu'un envoi RÉEL en produit
 * un, avec le contenu exact ; et qu'une action sans reçu devient un incident
 * VISIBLE plutôt qu'un silence.
 */
let c: pg.Client
let alice: string
let bob: string
let profil: string
let opportunite: string

const ETAT: EtatEnvoi = {
  suppressionDemandeeLe: null, arretUrgenceLe: null,
  parcoursTermineLe: '2026-08-01T00:00:00Z', cranDuCanal: 'agir-seul',
  mandats: [{
    canal: 'email', cran: 'agir-seul', accordeLe: '2026-08-01T00:00:00Z',
    expireLe: null, revoqueLe: null, apercuEmpreinte: 'a',
  }],
  quotaQuotidien: 99, envoyesAujourdHui: 0,
  plageDebutMinutes: 0, plageFinMinutes: 1440, minutesLocales: 600,
}

const DEST = (() => {
  const r = verifierDestination('rh@exemple.fr', {
    contacts: [{ adresse: 'rh@exemple.fr', provenance: 'contact-enregistre' }],
    domainesEmployeur: ['exemple.fr'],
  })
  if (!('verifiee' in r)) throw new Error('destination de test invalide')
  return r.verifiee
})()

const CV = 'Camille Dupont — infirmière, 8 ans en gériatrie.'
const LETTRE = 'Madame, Monsieur, votre poste en gériatrie correspond à mon parcours.'

const transport: Transport = async () => ({ reference: 'msg-1', recuLe: '2026-08-27T10:00:00Z' })

const travail = () => ({
  etat: ETAT, canal: 'email' as const, destination: DEST, transport,
  dossier: {
    opportuniteId: opportunite, canal: 'email' as const, questionsSansReponse: [],
    pieces: [
      { nature: 'cv' as const, intitule: 'votre CV adapté', contenu: CV, relue: true },
      { nature: 'lettre' as const, intitule: 'la lettre', contenu: LETTRE, relue: true },
    ],
  },
  profileId: profil, opportuniteId: opportunite, parQui: 'w1',
  cible: { employeurCanonique: 'exemple', titre: 'Infirmier' },
})

beforeAll(async () => {
  c = await admin()
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@recu.test'")
  alice = await creerCompte(c, 'alice@recu.test')
  bob = await creerCompte(c, 'bob@recu.test')
  profil = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [alice])).rows[0]!.id
  const offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature)
     values ('test', 'a', 'ref-recu-1', 'exemple', 'Exemple', 'Infirmier',
             'https://exemple.fr/1') returning id`)).rows[0]!.id
  opportunite = (await c.query<{ id: string }>(
    'insert into public.opportunites (profile_id, offre_id) values ($1, $2) returning id',
    [profil, offre])).rows[0]!.id
}, 30_000)

beforeEach(async () => {
  await c.query('delete from public.incidents where opportunite_id = $1', [opportunite])
  await c.query('delete from public.dossiers where opportunite_id = $1', [opportunite])
  // Les reçus sont IMMUABLES : le déclencheur refuse un DELETE ordinaire.
  //
  // Ne pas les effacer laissait chaque test hériter des reçus du précédent —
  // et, le dossier ayant disparu, la réconciliation les voyait à juste titre
  // comme des « reçus orphelins ». Trois assertions comptaient donc du résidu.
  // Le mécanisme correct existe déjà : le même drapeau que le parcours
  // d'effacement de compte, qui ne survit pas à la transaction.
  await c.query('begin')
  await c.query("select set_config('app.suppression_compte', 'true', true)")
  await c.query('delete from public.recus where opportunite_id = $1', [opportunite])
  await c.query('commit')
})

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@recu.test'")
  await c.query("delete from public.offres where identifiant_source = 'ref-recu-1'")
  await c.end()
})

const compterRecus = async (): Promise<number> =>
  (await c.query<{ n: number }>(
    'select count(*)::int as n from public.recus where opportunite_id = $1', [opportunite])
  ).rows[0]!.n

describe('toute action sortante produit un reçu', () => {
  it('un envoi réel écrit un reçu portant le TEXTE EXACT, pas une référence', async () => {
    const avant = await compterRecus()
    const issue = await traiterEnvoi(c, travail())
    expect(issue.type, JSON.stringify(issue)).toBe('envoye')
    expect(await compterRecus()).toBe(avant + 1)

    const { rows } = await c.query<{
      cv_texte: string; message_texte: string; cran_au_moment: string; resultat: string
    }>(
      `select cv_texte, message_texte, cran_au_moment, resultat from public.recus
        where opportunite_id = $1 order by envoye_le desc limit 1`, [opportunite])
    const r = rows[0]!
    // « Le CV exact et le texte exact envoyés ». Une référence pointerait vers
    // un document régénéré la semaine prochaine, qui ne dirait plus ce que le
    // recruteur a lu.
    expect(r.cv_texte).toBe(CV)
    expect(r.message_texte).toContain(LETTRE)
    expect(r.resultat).toBe('envoye')
  })

  it('le reçu porte le cran EN VIGUEUR À CET INSTANT', async () => {
    await traiterEnvoi(c, travail())
    const { rows } = await c.query<{ cran_au_moment: string }>(
      `select cran_au_moment from public.recus where opportunite_id = $1
        order by envoye_le desc limit 1`, [opportunite])
    expect(rows[0]!.cran_au_moment).toBe('agir-seul')
  })

  it('une PRÉPARATION n’en produit pas — elle n’a rien fait sortir', async () => {
    // Donner un reçu à une préparation viderait le mot de son sens : un reçu
    // affirme qu'une chose est partie.
    const avant = await compterRecus()
    const i = await traiterEnvoi(c, {
      ...travail(), canal: 'ats',
      dossier: { ...travail().dossier, canal: 'ats' as const },
      transport: (async () => { throw new Error('jamais') }) as Transport,
    })
    expect(i.type).toBe('prepare')
    expect(await compterRecus()).toBe(avant)
  })

  it('le reçu tombe DANS la même transaction que l’état de l’envoi', async () => {
    // Écrits séparément, il existerait une fenêtre où le produit affirme avoir
    // envoyé sans pouvoir dire quoi — le « trou » exact que REQ-013 interdit.
    await traiterEnvoi(c, travail())
    const { rows } = await c.query<{ n: number }>(
      `select count(*)::int as n
         from public.dossiers d join public.recus r
           on r.opportunite_id = d.opportunite_id and r.canal = d.canal
        where d.opportunite_id = $1 and d.issue = 'envoye'`, [opportunite])
    expect(rows[0]!.n).toBe(1)
  })
})

describe('une action sans reçu est un INCIDENT', () => {
  const abandonner = async () => {
    await reclamer(c, {
      profileId: profil, opportuniteId: opportunite, canal: 'email',
      parQui: 'w-mort', bailSecondes: 60,
    })
    // Le worker meurt : son bail expire, la réclamation reste.
    await c.query(
      `update public.dossiers set bail_jusqu_a = now() - interval '1 minute'
        where opportunite_id = $1`, [opportunite])
  }

  it('une réclamation abandonnée est CONSTATÉE', async () => {
    await abandonner()
    const trous = (await chercherTrous(c)).filter((t) => t.opportuniteId === opportunite)
    expect(trous.map((t) => t.genre)).toContain('action-sans-preuve')
  })

  it('le constat dit ce qui s’est passé ET ce que la personne peut faire', async () => {
    // Un incident sans conduite à tenir est une angoisse sans issue : le
    // produit sait ce qu'il ne sait pas, il doit dire quoi faire.
    await abandonner()
    const t = (await chercherTrous(c)).find((x) => x.opportuniteId === opportunite)
    expect(t?.constat).toContain('Infirmier')
    expect(t?.constat).toMatch(/je ne peux pas dire si elle est partie/i)
    expect(t?.conduite).toMatch(/je ne recommence pas seul/i)
  })

  it('un envoi enregistré SANS reçu est détecté', async () => {
    // L'invariant de transaction, vérifié plutôt que supposé. Une atomicité
    // qu'on n'observe jamais est un commentaire.
    await c.query(
      `insert into public.dossiers (profile_id, opportunite_id, canal, issue,
                                    confirmation_reference, destination_adresse)
       values ($1, $2, 'formulaire', 'envoye', 'x', 'rh@exemple.fr')`,
      [profil, opportunite])
    const trous = (await chercherTrous(c)).filter((t) => t.opportuniteId === opportunite)
    expect(trous.map((t) => t.genre)).toContain('envoi-sans-recu')
    await c.query("delete from public.dossiers where canal = 'formulaire' and opportunite_id = $1",
      [opportunite])
  })

  it('la réconciliation N’EMPILE PAS la même alerte à chaque tour', async () => {
    // Elle tourne en boucle. Deux cents lignes identiques n'alertent plus
    // personne : elles enterrent.
    //
    // L'assertion porte sur MON opportunité, pas sur le bilan global.
    // Une première version comparait `bilan.ouverts` à zéro — or la
    // réconciliation balaie toute la base, et les autres fichiers de test y
    // laissent des dossiers. Le test échouait une fois sur trois, sur du
    // résidu, et pas une seule fois sur ce qu'il prétendait vérifier.
    await abandonner()
    const compte = async (): Promise<number> =>
      (await c.query<{ n: number }>(
        'select count(*)::int as n from public.incidents where opportunite_id = $1',
        [opportunite])).rows[0]!.n

    await reconcilier(c)
    const apresUn = await compte()
    expect(apresUn).toBe(1)

    await reconcilier(c)
    expect(await compte()).toBe(1)
  })
})

describe('l’incident est VISIBLE par la personne concernée', () => {
  beforeEach(async () => {
    await reclamer(c, {
      profileId: profil, opportuniteId: opportunite, canal: 'email',
      parQui: 'w-mort', bailSecondes: 60,
    })
    await c.query(
      `update public.dossiers set bail_jusqu_a = now() - interval '1 minute'
        where opportunite_id = $1`, [opportunite])
    await reconcilier(c)
  })

  it('ALLOW : Alice voit son incident', async () => {
    // Un incident qui ne remonterait qu'à un tableau d'exploitation la
    // laisserait ignorer qu'elle a peut-être postulé.
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select genre from public.incidents where opportunite_id = $1', [opportunite]))
    expect(rows).toHaveLength(1)
  })

  it('DENY : Bob ne voit rien', async () => {
    const { rows } = await asUser(c, bob, (x) => x.query('select id from public.incidents'))
    expect(rows).toHaveLength(0)
  })

  it('DENY : elle ne peut pas le faire disparaître elle-même', async () => {
    // Le clore est une action du produit ou du support, pas une case qu'on
    // décoche pour faire taire le message.
    for (const sql of [
      'update public.incidents set clos_le = now() where opportunite_id = $1',
      'delete from public.incidents where opportunite_id = $1',
    ])
      await expect(asUser(c, alice, (x) => x.query(sql, [opportunite])), sql)
        .rejects.toThrow(/permission denied|violates row-level/i)
  })

  it('un incident se CLÔT, il ne s’efface pas', async () => {
    const id = (await c.query<{ id: string }>(
      'select id from public.incidents where opportunite_id = $1', [opportunite])).rows[0]!.id
    expect(await clore(c, { incidentId: id, par: 'support', motif: 'vérifié : rien n’est parti' }))
      .toBe(true)
    const { rows } = await c.query<{ clos_motif: string }>(
      'select clos_motif from public.incidents where id = $1', [id])
    expect(rows[0]!.clos_motif).toMatch(/rien n’est parti/)
    // Clore deux fois ne fait rien : « déjà traité » n'est pas une erreur.
    expect(await clore(c, { incidentId: id, par: 'support', motif: 'encore' })).toBe(false)
  })
})

describe('un recu au CV VIDE n\u2019est pas un recu', () => {
  it('un envoi dont le recu est vide est signale comme sans preuve', async () => {
    // « Le CV exact » dit REQ-013. Une colonne vide est une preuve qui n\u2019en est
    // pas — et elle est pire que rien, parce qu\u2019elle a l\u2019air d\u2019exister.
    await c.query(
      `insert into public.dossiers (profile_id, opportunite_id, canal, issue,
                                    confirmation_reference, destination_adresse)
       values ($1, $2, 'formulaire', 'envoye', 'x', 'rh@exemple.fr')`,
      [profil, opportunite])
    await c.query(
      `insert into public.recus (profile_id, opportunite_id, canal, cv_texte,
                                 cran_au_moment, resultat)
       values ($1, $2, 'formulaire', '   ', 'agir-seul', 'envoye')`,
      [profil, opportunite])
    const trous = (await chercherTrous(c)).filter((t) => t.opportuniteId === opportunite)
    expect(trous.map((t) => t.genre)).toContain('envoi-sans-recu')
    await c.query("delete from public.dossiers where canal = 'formulaire' and opportunite_id = $1",
      [opportunite])
  })
})
