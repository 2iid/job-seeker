import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin } from '@job-seeker/testing'

/**
 * JOB-073 — la moitié de la limitation qui vit en SQL.
 *
 * Les tests TypeScript vérifient les décisions (l'ordre des clés, le refus sur
 * panne, l'uniformité du message). Ils ne vérifient RIEN de ce qui compte
 * vraiment ici : la fenêtre glisse-t-elle, le compteur repart-il, et deux
 * appels simultanés à la limite exacte passent-ils tous les deux ? Cette
 * dernière question est la seule qui ne se voit pas à la lecture, et c'est
 * précisément celle qui se pose quand quelqu'un tape fort.
 */
let c: pg.Client

const consommer = async (cle: string, fenetre: number, plafond: number) =>
  (
    await c.query<{ compte: number; fin_fenetre: Date; autorise: boolean }>(
      'select * from public.consommer_jeton($1, $2, $3)',
      [cle, fenetre, plafond],
    )
  ).rows[0]!

beforeAll(async () => {
  c = await admin()
  await c.query("delete from public.limitation_debit where cle like 'test-%'")
})
afterAll(async () => {
  await c.query("delete from public.limitation_debit where cle like 'test-%'")
  await c.end()
})

describe('consommer_jeton', () => {
  it('autorise jusqu’au plafond inclus, refuse au-delà', async () => {
    const cle = 'test-plafond'
    for (let i = 1; i <= 3; i += 1) {
      const r = await consommer(cle, 3600, 3)
      expect(r.compte).toBe(i)
      expect(r.autorise).toBe(true)
    }
    const trop = await consommer(cle, 3600, 3)
    expect(trop.compte).toBe(4)
    expect(trop.autorise).toBe(false)
  })

  it('continue de compter au-delà du refus — sinon marteler resterait gratuit', async () => {
    const cle = 'test-au-dela'
    for (let i = 0; i < 5; i += 1) await consommer(cle, 3600, 1)
    const r = await consommer(cle, 3600, 1)
    expect(r.compte).toBe(6)
    expect(r.autorise).toBe(false)
  })

  it('repart à un quand la fenêtre est passée', async () => {
    const cle = 'test-fenetre'
    // Fenêtre d'une seconde : on la laisse réellement expirer plutôt que de
    // truquer l'horloge — c'est `now()` de Postgres qui décide en production.
    expect((await consommer(cle, 1, 2)).compte).toBe(1)
    expect((await consommer(cle, 1, 2)).compte).toBe(2)
    expect((await consommer(cle, 1, 2)).autorise).toBe(false)
    await new Promise((r) => setTimeout(r, 1200))
    const apres = await consommer(cle, 1, 2)
    expect(apres.compte).toBe(1)
    expect(apres.autorise).toBe(true)
  })

  it('rend une fin de fenêtre dans le futur, cohérente avec la durée demandée', async () => {
    const r = await consommer('test-fin', 600, 5)
    const dans = (r.fin_fenetre.getTime() - Date.now()) / 1000
    expect(dans).toBeGreaterThan(590)
    expect(dans).toBeLessThanOrEqual(601)
  })

  it('n’en laisse pas passer deux à la limite exacte, en parallèle', async () => {
    // LE test de ce fichier. Une implémentation « lire puis écrire » passe tous
    // les autres et échoue ici : les deux transactions lisent 4, écrivent 5, et
    // le sixième appel s'autorise. C'est pour cela que la fonction fait
    // l'incrément et la remise à zéro dans UNE instruction.
    const cle = 'test-course'
    const clients = await Promise.all([admin(), admin(), admin(), admin(), admin(), admin()])
    try {
      const verdicts = await Promise.all(
        clients.map(async (x) =>
          (
            await x.query<{ autorise: boolean }>(
              'select autorise from public.consommer_jeton($1, $2, $3)',
              [cle, 3600, 4],
            )
          ).rows[0]!.autorise,
        ),
      )
      expect(verdicts.filter(Boolean)).toHaveLength(4)
    } finally {
      await Promise.all(clients.map((x) => x.end()))
    }
  })

  it('sépare les clés : le quota de quelqu’un n’est pas celui de son voisin', async () => {
    await consommer('test-a', 3600, 1)
    await consommer('test-a', 3600, 1)
    expect((await consommer('test-b', 3600, 1)).autorise).toBe(true)
  })
})

describe('la table de limitation n’est pas un carnet d’adresses', () => {
  it('n’est lisible ni par anon ni par authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      await c.query('begin')
      try {
        await c.query(`set local role ${role}`)
        await expect(c.query('select * from public.limitation_debit')).rejects.toThrow(
          /permission denied/i,
        )
      } finally {
        await c.query('rollback')
      }
    }
  })

  it('mais la fonction reste appelable par un visiteur non authentifié', async () => {
    // Sans cela, /auth/lien ne peut pas se limiter : celui qui demande un lien
    // de connexion n'a, par définition, aucun droit.
    await c.query('begin')
    try {
      await c.query('set local role anon')
      const r = await c.query('select autorise from public.consommer_jeton($1, 60, 5)', [
        'test-anon',
      ])
      expect(r.rows[0]!.autorise).toBe(true)
    } finally {
      await c.query('rollback')
    }
  })

  it('purge ce qui a expiré', async () => {
    await c.query(
      `insert into public.limitation_debit (cle, fenetre_debut, compte, expire_le)
       values ('test-vieux', now() - interval '3 hours', 9, now() - interval '2 hours')`,
    )
    await c.query('select public.purger_limitation()')
    const reste = await c.query("select 1 from public.limitation_debit where cle = 'test-vieux'")
    expect(reste.rowCount).toBe(0)
  })
})
