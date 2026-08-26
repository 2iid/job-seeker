import type pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'
import { canoniserEmployeur } from '../sources/dedupe.ts'
import { aRelever, enregistrer, noterReleve, promouvoir } from './index.ts'

/** On DEMANDE la clé au canonicaliseur : la supposer, c'est dupliquer sa règle. */
const cle = (nom: string): string => canoniserEmployeur(nom)

/**
 * JOB-025 / JOB-026 — le registre partagé, contre la vraie base.
 *
 * Le test qui compte le plus n'est pas fonctionnel : c'est celui qui vérifie
 * que ce registre ne porte AUCUNE donnée d'utilisateur. Un registre partagé
 * entre tous les comptes qui contiendrait un identifiant de profil serait un
 * canal de fuite entre comptes, et il aurait l'air parfaitement normal.
 */

let db: pg.Client
const marque = 'zztestregistre'

beforeAll(async () => { db = await admin() }, 30_000)
afterEach(async () => {
  await db.query('delete from worker.employeurs where nom_canonique like $1', [`${marque}%`])
  await db.query("delete from auth.users where email like '%@registre.test'")
})
afterAll(async () => { await db.end() })

describe('la frontière du registre partagé', () => {
  it('worker.employeurs ne contient AUCUNE colonne désignant un utilisateur', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'worker' and table_name = 'employeurs'`,
    )
    const suspectes = rows
      .map((r) => r.column_name)
      .filter((c) => /user|profil|profile|compte|account|email/i.test(c))
    expect(suspectes, 'une colonne du registre partagé désigne un utilisateur').toEqual([])
  })

  it('aucun rôle client n’atteint le registre', async () => {
    const { rows } = await db.query(
      `select 1 from information_schema.role_table_grants
        where table_schema = 'worker' and table_name = 'employeurs'
          and grantee in ('anon','authenticated')`,
    )
    expect(rows).toEqual([])
  })

  it('le lien « qui suit qui » est, LUI, cloisonné', async () => {
    // Savoir quelles entreprises quelqu'un surveille en dit long sur sa
    // recherche : c'est une donnée personnelle, pas une donnée d'entreprise.
    const alice = await creerCompte(db, 'alice@registre.test')
    const bob = await creerCompte(db, 'bob@registre.test')
    const idDe = async (u: string) =>
      (await db.query<{ id: string }>('select id from public.profiles where user_id = $1', [u])).rows[0]!.id
    const pAlice = await idDe(alice)
    const pBob = await idDe(bob)

    await db.query('insert into public.employeurs_suivis (profile_id, nom_canonique) values ($1,$2)', [pAlice, `${marque}qonto`])
    await db.query('insert into public.employeurs_suivis (profile_id, nom_canonique) values ($1,$2)', [pBob, `${marque}swile`])

    const vues = await asUser(db, alice, (x) => x.query('select nom_canonique from public.employeurs_suivis'))
    expect(vues.rows.map((r: { nom_canonique: string }) => r.nom_canonique)).toEqual([cle(`${marque}Qonto`)])
  })
})

describe('une entreprise est résolue une fois pour tout le monde', () => {
  it('l’enregistrement est idempotent', async () => {
    const a = await enregistrer(db, `${marque}Qonto`)
    const b = await enregistrer(db, `${marque}QONTO SAS`)
    expect(b.nomCanonique).toBe(a.nomCanonique)
    const { rows } = await db.query('select 1 from worker.employeurs where nom_canonique = $1', [a.nomCanonique])
    expect(rows).toHaveLength(1)
  })

  it('le compteur de priorité se tient tout seul', async () => {
    // Un compteur maintenu par le code applicatif dérive au premier chemin
    // qu'on oublie de mettre à jour.
    const alice = await creerCompte(db, 'alice@registre.test')
    const p = (await db.query<{ id: string }>('select id from public.profiles where user_id = $1', [alice])).rows[0]!.id
    await db.query('insert into public.employeurs_suivis (profile_id, nom_canonique) values ($1,$2)', [p, `${marque}alan`])
    const { rows } = await db.query<{ suivi_par: number }>('select suivi_par from worker.employeurs where nom_canonique = $1', [`${marque}alan`])
    expect(rows[0]?.suivi_par).toBe(1)

    await db.query('delete from public.employeurs_suivis where profile_id = $1', [p])
    const { rows: apres } = await db.query<{ suivi_par: number }>('select suivi_par from worker.employeurs where nom_canonique = $1', [`${marque}alan`])
    expect(apres[0]?.suivi_par).toBe(0)
  })
})

describe('JOB-026 — la découverte alimente la surveillance', () => {
  it('un board publié fait MONTER l’entreprise au palier A', async () => {
    await enregistrer(db, `${marque}Qonto`)
    const r = await promouvoir(db, `${marque}Qonto`, '<a href="https://job-boards.greenhouse.io/qontoboard/jobs/1">')
    expect(r.promu).toBe(true)
    const { rows } = await db.query<{ palier: string; ats_slug: string }>(
      'select palier, ats_slug from worker.employeurs where nom_canonique = $1', [cle(`${marque}Qonto`)])
    expect(rows[0]).toMatchObject({ palier: 'a', ats_slug: 'qontoboard' })
  })

  it('sans board publié, aucune promotion — jamais sur une devinette', async () => {
    await enregistrer(db, `${marque}Opaque`)
    const r = await promouvoir(db, `${marque}Opaque`, '<html>Nous recrutons, écrivez-nous</html>')
    expect(r.promu).toBe(false)
    const { rows } = await db.query<{ palier: string }>(
      'select palier from worker.employeurs where nom_canonique = $1', [cle(`${marque}Opaque`)])
    expect(rows[0]?.palier).toBe('b')
  })

  it('ne réécrit pas un board déjà résolu', async () => {
    // Une page carrière refaite peut pointer ailleurs le temps d'un
    // déploiement : on perdrait une source qui marchait.
    await enregistrer(db, `${marque}Stable`)
    await promouvoir(db, `${marque}Stable`, '<a href="https://jobs.lever.co/bonslug/x">')
    const r = await promouvoir(db, `${marque}Stable`, '<a href="https://jobs.lever.co/mauvaisslug/x">')
    expect(r.promu).toBe(false)
    const { rows } = await db.query<{ ats_slug: string }>(
      'select ats_slug from worker.employeurs where nom_canonique = $1', [cle(`${marque}Stable`)])
    expect(rows[0]?.ats_slug).toBe('bonslug')
  })

  it('la base REFUSE un palier A sans board', async () => {
    await enregistrer(db, `${marque}SansBoard`)
    await expect(
      db.query("update worker.employeurs set palier = 'a' where nom_canonique = $1", [cle(`${marque}SansBoard`)]),
      'un palier A sans board promettrait une fraîcheur qu’on ne peut pas tenir',
    ).rejects.toThrow(/check constraint/i)
  })
})

describe('qui relever, et dans quel ordre', () => {
  it('un employeur que PERSONNE ne suit n’est pas relevé', async () => {
    // C'est ce qui fait que le coût suit les employeurs suivis, pas les inscrits.
    await enregistrer(db, `${marque}Ignore`)
    const liste = await aRelever(db, { limite: 100 })
    expect(liste.map((e) => e.nomCanonique)).not.toContain(cle(`${marque}Ignore`))
  })

  it('les plus suivis passent devant', async () => {
    await db.query(
      `insert into worker.employeurs (nom_canonique, nom_affiche, suivi_par) values
        ($1,'peu',1), ($2,'beaucoup',50)`,
      [`${marque}peu`, `${marque}beaucoup`],
    )
    const liste = await aRelever(db, { limite: 100 })
    const noms = liste.map((e) => e.nomCanonique)
    expect(noms.indexOf(`${marque}beaucoup`)).toBeLessThan(noms.indexOf(`${marque}peu`))
  })

  it('un employeur relevé à l’instant n’est pas re-relevé', async () => {
    await db.query('insert into worker.employeurs (nom_canonique, nom_affiche, suivi_par) values ($1,$1,3)', [`${marque}frais`])
    await noterReleve(db, `${marque}frais`, 'ok')
    const liste = await aRelever(db, { ageMinimumSecondes: 300, limite: 100 })
    expect(liste.map((e) => e.nomCanonique)).not.toContain(`${marque}frais`)
  })
})
