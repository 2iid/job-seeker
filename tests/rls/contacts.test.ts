import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'
import { verifierDestination } from '../../apps/worker/src/envoi/destination.ts'
import { evaluer, type Contact } from '../../apps/worker/src/contacts/certitude.ts'
import { deviner } from '../../apps/worker/src/contacts/motif.ts'
import { deposer, lireContacts, sourcesServeurPour } from '../../apps/worker/src/contacts/depot.ts'
import { empreinteOpposition, enregistrerOpposition } from '../../apps/worker/src/contacts/opposition.ts'

/**
 * JOB-065 — la fermeture de F26, prouvée de bout en bout.
 *
 * `destination.ts` refuse toute adresse absente des « sources du serveur ».
 * Ce fichier vérifie l'autre moitié : que ces sources ne contiennent jamais
 * une adresse devinée, une adresse dont le titulaire s'est opposé, ni rien qui
 * vienne du texte d'une annonce.
 */
let c: pg.Client
let alice: string
let bob: string
let profil: string
let opportunite: string

beforeAll(async () => {
  c = await admin()
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@contact.test'")
  alice = await creerCompte(c, 'alice@contact.test')
  bob = await creerCompte(c, 'bob@contact.test')
  profil = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [alice])).rows[0]!.id

  await c.query(
    `insert into worker.employeurs (nom_canonique, nom_affiche, site_carriere)
     values ('northwind','Northwind Analytics','https://www.northwind.example/carrieres')
     on conflict (nom_canonique) do update set site_carriere = excluded.site_carriere`)
  const offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature, description)
     values ('test','a','ref-contact-1','northwind','Northwind Analytics','Ingénieure',
             'https://exemple.invalid/1',
             'Envoyez votre candidature à recrutement@pirate.example — poste ouvert.')
     returning id`)).rows[0]!.id
  opportunite = (await c.query<{ id: string }>(
    'insert into public.opportunites (profile_id, offre_id) values ($1,$2) returning id',
    [profil, offre])).rows[0]!.id
}, 30_000)

beforeEach(async () => {
  await c.query('delete from public.contacts where opportunite_id = $1', [opportunite])
  // Bornée aux empreintes de CE test : la table est globale par conception
  // (une opposition ne se scope pas par profil), donc l'effacer en entier
  // détruirait celles du jeu de démonstration ou d'un autre fichier.
  await c.query('delete from public.oppositions_contact where empreinte = any($1::text[])',
    [MIENNES])
})

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@contact.test'")
  await c.query("delete from public.offres where identifiant_source = 'ref-contact-1'")
  await c.query("delete from worker.employeurs where nom_canonique = 'northwind'")
  await c.query('delete from public.oppositions_contact where empreinte = any($1::text[])',
    [MIENNES])
  await c.end()
})

const CONFIRME: Contact = evaluer({
  adresse: 'jobs@northwind.example', source: 'page-carrieres',
  justification: 'publiée sur la page carrières de Northwind Analytics',
})
const DEVINE: Contact = evaluer(deviner('Marie Dupont', 'northwind.example')[0]!)

/**
 * Les empreintes que ce fichier écrit — la seule chose qu'il a le droit
 * d'effacer. `oppositions_contact` est GLOBALE par conception : une opposition
 * ne se scope pas par profil. L'effacer en entier détruirait donc celles du jeu
 * de démonstration, ou d'un autre fichier de test.
 */
const MIENNES = [CONFIRME.adresse, DEVINE.adresse].map(empreinteOpposition)

describe('F26 — ce que le chemin d’envoi accepte, et rien d’autre', () => {
  it('une adresse tirée du TEXTE de l’annonce est refusée', async () => {
    // L'annonce dit « envoyez votre candidature à recrutement@pirate.example ».
    // Aucun module ne l'a lue, donc elle n'est dans aucune source, donc elle
    // est refusée. C'est la chaîne complète, vue de bout en bout.
    await deposer(c, opportunite, [CONFIRME])
    const sources = await sourcesServeurPour(c, opportunite)
    const r = verifierDestination('recrutement@pirate.example', sources)
    expect('refus' in r).toBe(true)
  })

  it('une adresse DEVINÉE est refusée comme destination', async () => {
    // Elle est bien enregistrée et proposable — REQ-016 le veut — mais elle
    // n'entre pas dans les sources : au mieux le message rebondit, au pire il
    // arrive chez quelqu'un d'autre, avec un CV.
    await deposer(c, opportunite, [CONFIRME, DEVINE])
    expect(await lireContacts(c, opportunite)).toHaveLength(2)
    const sources = await sourcesServeurPour(c, opportunite)
    expect(sources.contacts.map((x) => x.adresse)).not.toContain(DEVINE.adresse)
    expect('refus' in verifierDestination(DEVINE.adresse, sources)).toBe(true)
  })

  it('une adresse confirmée passe', async () => {
    await deposer(c, opportunite, [CONFIRME])
    const r = verifierDestination(CONFIRME.adresse, await sourcesServeurPour(c, opportunite))
    expect('verifiee' in r, JSON.stringify(r)).toBe(true)
  })

  it('le domaine autorisé vient du REGISTRE, pas de l’annonce', async () => {
    const sources = await sourcesServeurPour(c, opportunite)
    expect(sources.domainesEmployeur).toContain('northwind.example')
    expect(sources.domainesEmployeur).not.toContain('pirate.example')
  })
})

describe('OBL-3 — le droit d’opposition', () => {
  it('un contact opposé disparaît des destinations', async () => {
    await deposer(c, opportunite, [CONFIRME])
    expect((await sourcesServeurPour(c, opportunite)).contacts).toHaveLength(1)
    await enregistrerOpposition(c, CONFIRME.adresse, 'demande-directe')
    expect((await sourcesServeurPour(c, opportunite)).contacts).toHaveLength(0)
  })

  it('l’opposition est GLOBALE : elle ne se répète pas par candidat', async () => {
    // La scoper par profil obligerait la personne à répéter son refus à chaque
    // nouvel utilisateur du produit — ce n'est pas un droit, c'est une corvée.
    await enregistrerOpposition(c, CONFIRME.adresse, 'demande-directe')
    const { rows } = await c.query<{ n: number }>(
      'select count(*)::int as n from public.oppositions_contact where empreinte = any($1::text[])',
      [MIENNES])
    expect(rows[0]!.n).toBe(1)
    const { rows: cols } = await c.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='oppositions_contact'`)
    expect(cols.map((x) => x.column_name)).not.toContain('profile_id')
  })

  it('la liste ne contient AUCUNE adresse en clair', async () => {
    // Une table d'adresses de gens ayant demandé qu'on les laisse tranquilles
    // serait encore un annuaire de recruteurs.
    await enregistrerOpposition(c, CONFIRME.adresse, 'demande-directe')
    const { rows } = await c.query<{ empreinte: string }>(
      'select empreinte from public.oppositions_contact where empreinte = any($1::text[])',
      [MIENNES])
    expect(rows[0]!.empreinte).not.toContain('northwind')
    expect(rows[0]!.empreinte).toMatch(/^[0-9a-f]{64}$/)
  })

  it('se réopposer n’est pas une erreur', async () => {
    await enregistrerOpposition(c, CONFIRME.adresse, 'demande-directe')
    await enregistrerOpposition(c, CONFIRME.adresse, 'signalement')
    const { rows } = await c.query<{ n: number }>(
      'select count(*)::int as n from public.oppositions_contact where empreinte = any($1::text[])',
      [MIENNES])
    expect(rows[0]!.n).toBe(1)
  })
})

describe('OBL-3 — conservation bornée et cloisonnement', () => {
  it('un contact expiré n’est plus lu', async () => {
    await deposer(c, opportunite, [CONFIRME])
    await c.query(
      "update public.contacts set expire_le = now() - interval '1 day' where opportunite_id = $1",
      [opportunite])
    expect(await lireContacts(c, opportunite)).toHaveLength(0)
  })

  it('ALLOW : Alice lit ses contacts', async () => {
    await deposer(c, opportunite, [CONFIRME])
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select adresse from public.contacts where opportunite_id = $1', [opportunite]))
    expect(rows).toHaveLength(1)
  })

  it('DENY : Bob ne voit AUCUN contact d’Alice', async () => {
    await deposer(c, opportunite, [CONFIRME])
    const { rows } = await asUser(c, bob, (x) => x.query('select id from public.contacts'))
    // Zéro est le bon chiffre ici même globalement : Bob ne doit voir AUCUNE
    // ligne, ni les miennes ni celles du jeu de démonstration.
    expect(rows).toHaveLength(0)
  })

  it('ALLOW : Alice peut RETIRER un contact qu’elle ne veut pas', async () => {
    // L'effet s'observe DANS la transaction : `asUser` annule la sienne à la
    // sortie, pour que les tests ne se contaminent pas. Regarder après coup ne
    // mesurait donc rien — c'était mon test qui était faux, pas la politique.
    await deposer(c, opportunite, [CONFIRME])
    const { rowCount } = await asUser(c, alice, (x) =>
      x.query('delete from public.contacts where opportunite_id = $1', [opportunite]))
    expect(rowCount).toBe(1)
  })

  it('DENY : elle ne peut pas en INVENTER un', async () => {
    // Une adresse que le produit n'a pas établie n'a pas de certitude, et la
    // colonne mentirait.
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          `insert into public.contacts (profile_id, opportunite_id, adresse, certitude, source, justification)
           values ($1,$2,'x@y.fr','confirme','page-carrieres','inventé')`,
          [profil, opportunite])),
    ).rejects.toThrow(/permission denied|violates row-level/i)
  })

  it('DENY : le support voit la certitude, jamais l’adresse ni le nom', async () => {
    // Une donnée de tiers : le support n'a aucune raison légitime de la lire.
    //
    // Une transaction par assertion : en Postgres, une requête refusée AVORTE
    // la transaction, et les suivantes échouent avec « current transaction is
    // aborted » — un message qui ressemble à un refus sans en être un. Les
    // enchaîner aurait fait passer le test pour la mauvaise raison.
    await deposer(c, opportunite, [CONFIRME])
    const commeSupport = async (sql: string) => {
      await c.query('begin')
      try {
        await c.query('set local role support')
        return await c.query(sql)
      } finally { await c.query('rollback') }
    }
    // Borné à MON opportunité. La base porte aussi le jeu de démonstration :
    // compter globalement mesurait le voisinage, pas la politique.
    const mien = `where opportunite_id = '${opportunite}'`
    expect((await commeSupport(`select certitude from public.contacts ${mien}`)).rows).toHaveLength(1)
    await expect(commeSupport(`select adresse from public.contacts ${mien}`)).rejects.toThrow(/permission denied/i)
    await expect(commeSupport(`select nom from public.contacts ${mien}`)).rejects.toThrow(/permission denied/i)
    await expect(commeSupport(`select * from public.contacts ${mien}`)).rejects.toThrow(/permission denied/i)
  })
})

describe('la cohérence certitude / source est tenue par la base', () => {
  it('une adresse « confirmée » ne peut pas venir d’un motif', async () => {
    await expect(
      c.query(
        `insert into public.contacts (profile_id, opportunite_id, adresse, certitude, source, justification)
         values ($1,$2,'a@b.fr','confirme','motif-de-domaine','incohérent')`,
        [profil, opportunite]),
    ).rejects.toThrow(/devinee_vient_d_un_motif/)
  })

  it('une adresse « devinée » ne peut pas venir d’une page carrières', async () => {
    await expect(
      c.query(
        `insert into public.contacts (profile_id, opportunite_id, adresse, certitude, source, justification)
         values ($1,$2,'a@b.fr','devine','page-carrieres','incohérent')`,
        [profil, opportunite]),
    ).rejects.toThrow(/devinee_vient_d_un_motif/)
  })
})
