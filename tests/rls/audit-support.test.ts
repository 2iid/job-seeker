import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'

/**
 * JOB-057 / REQ-014 — « le support ne peut pas lire le contenu des documents et
 * des messages, quel que soit son rôle applicatif — TESTÉ AU NIVEAU DE LA BASE ».
 *
 * Les quatre derniers mots sont la raison d'être de ce fichier.
 *
 * Un contrôle applicatif — « l'écran du support n'affiche pas le CV » — tient
 * tant que personne n'écrit une seconde requête. Il ne tient pas contre un
 * export improvisé, un script de dépannage, une console ouverte un soir
 * d'incident. Or c'est exactement dans ces moments-là qu'on lit un CV « juste
 * pour comprendre le problème ».
 */

let c: pg.Client
let alice: string
let profilAlice: string
let recu: string

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
  await c.query("delete from auth.users where email like '%@audit.test'")
  alice = await creerCompte(c, 'alice@audit.test')
  profilAlice = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [alice],
  )).rows[0]!.id
  recu = (await c.query<{ id: string }>(
    `insert into public.recus (profile_id, canal, cv_texte, message_texte, cran_au_moment, resultat)
     values ($1, 'email', 'CV CONFIDENTIEL', 'Bonjour Camille', 'agir-seul', 'accepte') returning id`,
    [profilAlice],
  )).rows[0]!.id
}, 40_000)

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@audit.test'")
  await c.end()
})

describe('le support voit l’état technique', () => {
  it('il lit le RÉSULTAT d’un envoi, son canal et son horodatage', () => {
    // Son travail est réel : comprendre pourquoi une candidature est bloquée.
    // Un rôle qui ne peut rien faire serait contourné le premier jour par un
    // accès `postgres` partagé.
    return commeSupport(async (x) => {
      const { rows } = await x.query(
        'select canal, resultat, envoye_le from public.recus where id = $1', [recu],
      )
      expect(rows[0]).toMatchObject({ canal: 'email', resultat: 'accepte' })
    })
  })

  it('il lit la file de travaux du worker — le cœur du dépannage', async () => {
    await commeSupport((x) => x.query('select 1 from worker.jobs limit 1'))
  })

  it('il lit l’état d’un profil, sans son contenu', () => {
    return commeSupport(async (x) => {
      const { rows } = await x.query(
        'select cran_autonomie, quota_quotidien, arret_urgence_le from public.profiles where id = $1',
        [profilAlice],
      )
      expect(rows[0]).toMatchObject({ cran_autonomie: 'proposer' })
    })
  })
})

describe('DENY — le support ne lit PAS le contenu', () => {
  it('ni le CV envoyé', async () => {
    // Ce n'est pas qu'il ne le fait pas : c'est que Postgres refuse. Aucune
    // requête, aucun outil, aucun soir d'incident ne contourne ça.
    await expect(
      commeSupport((x) => x.query('select cv_texte from public.recus where id = $1', [recu])),
    ).rejects.toThrow(/permission denied for (column|table)/i)
  })

  it('ni le message envoyé au recruteur', async () => {
    await expect(
      commeSupport((x) => x.query('select message_texte from public.recus where id = $1', [recu])),
    ).rejects.toThrow(/permission denied for (column|table)/i)
  })

  it('ni les preuves d’un score — elles citent l’offre ET le profil', async () => {
    await expect(
      commeSupport((x) => x.query('select correspondances from public.opportunites limit 1')),
    ).rejects.toThrow(/permission denied for (column|table)/i)
  })

  it('ni le nom d’un fichier — un nom de fichier dit déjà beaucoup', async () => {
    await expect(
      commeSupport((x) => x.query('select nom_origine from public.documents limit 1')),
    ).rejects.toThrow(/permission denied for (column|table)/i)
  })

  it('ni le chemin de stockage — il donne accès au fichier', async () => {
    await expect(
      commeSupport((x) => x.query('select chemin_stockage from public.documents limit 1')),
    ).rejects.toThrow(/permission denied for (column|table)/i)
  })

  it('ni le parcours de la personne', async () => {
    for (const table of ['experiences', 'formations', 'competences', 'criteres_recherche', 'reponses_reference']) {
      await expect(
        commeSupport((x) => x.query(`select * from public.${table} limit 1`)),
        table,
      ).rejects.toThrow(/permission denied/i)
    }
  })

  it('`select *` ne contourne rien — c’est le piège évident', async () => {
    // Un privilège par COLONNE se contournerait par un `select *` si Postgres
    // le tolérait. Il ne le tolère pas, et il fallait le vérifier.
    await expect(
      commeSupport((x) => x.query('select * from public.recus limit 1')),
    ).rejects.toThrow(/permission denied/i)
  })

  it('il n’ÉCRIT nulle part', async () => {
    await expect(
      commeSupport((x) =>
        x.query("update public.profiles set quota_quotidien = 200 where id = $1", [profilAlice]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('le journal d’audit', () => {
  it('enregistre une action sans recopier le contenu', async () => {
    // Un journal d audit qui recopie ce qu'il protège est une seconde fuite.
    const { rows } = await c.query<{ id: string }>(
      `insert into audit.acces (acteur, acteur_id, action, objet_table, objet_id, profile_id, detail)
       values ('support', $1, 'lecture-etat-candidature', 'recus', $2, $3, '{"motif":"ticket-4412"}'::jsonb)
       returning id`,
      [alice, recu, profilAlice],
    )
    expect(rows[0]!.id).toBeTruthy()
  })

  it('le support LIT le journal — y compris ses propres accès', async () => {
    const { rows } = await commeSupport((x) =>
      x.query("select action from audit.acces where acteur = 'support'"),
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('PERSONNE ne le modifie, pas même la connexion superutilisateur', async () => {
    // Le premier à vouloir corriger un journal est celui qui a quelque chose à
    // effacer.
    await expect(
      c.query("update audit.acces set action = 'rien' where acteur = 'support'"),
    ).rejects.toThrow(/insertion seule/i)
    await expect(
      c.query("delete from audit.acces where acteur = 'support'"),
    ).rejects.toThrow(/insertion seule/i)
  })

  it('une suppression de compte l’ANONYMISE au lieu de l’effacer', async () => {
    // Un reçu appartient à la personne ; un journal d'audit documente QUI A
    // ACCÉDÉ À QUOI, y compris le support. L'effacer avec le compte donnerait
    // à un support un moyen très simple de faire disparaître ses propres
    // accès.
    const { rows } = await c.query<{ id: string }>(
      `insert into audit.acces (acteur, action, objet_table, objet_id, profile_id)
       values ('support', 'lecture', 'recus', 'x', $1) returning id`, [profilAlice],
    )
    const id = rows[0]!.id
    await c.query('update audit.acces set profile_id = null where id = $1', [id])
    const apres = await c.query<{ action: string; profile_id: string | null }>(
      'select action, profile_id from audit.acces where id = $1', [id],
    )
    // La ligne reste, son LIEN part.
    expect(apres.rows[0]).toEqual({ action: 'lecture', profile_id: null })
  })

  it('… et l’anonymisation ne peut RIEN changer d’autre', async () => {
    // Sans cette égalité stricte, « suppression de compte » deviendrait une
    // porte pour corriger un journal au passage.
    const { rows } = await c.query<{ id: string }>(
      `insert into audit.acces (acteur, action, objet_table, profile_id)
       values ('support', 'lecture-a-justifier', 'recus', $1) returning id`, [profilAlice],
    )
    await expect(
      c.query("update audit.acces set profile_id = null, action = 'rien' where id = $1", [rows[0]!.id]),
    ).rejects.toThrow(/insertion seule/i)
  })

  it('la personne lit SES lignes — c’est un droit, pas une fuite', async () => {
    // J'avais d'abord supposé l'inverse. C'était une supposition, pas une
    // exigence : REQ-014 place le journal dans les droits de la personne, et
    // le « y compris ceux du support » n'a de sens que si quelqu'un peut le
    // lire — d'abord celui dont on a lu le dossier.
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select action, acteur from audit.acces'),
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows as { acteur: string }[]) expect(['support', 'candidat', 'worker', 'systeme']).toContain(r.acteur)
  })

  it('… et seulement les siennes', async () => {
    const bob = await creerCompte(c, 'bob@audit.test')
    const { rows } = await asUser(c, bob, (x) => x.query('select 1 from audit.acces'))
    expect(rows).toEqual([])
  })

  it('une ligne ANONYMISÉE n’appartient plus à personne', async () => {
    // Elle reste lisible par le support, invisible pour tout candidat : la
    // responsabilité reste vérifiable, la personne n'est plus dedans.
    const { rows } = await c.query<{ id: string }>(
      `insert into audit.acces (acteur, action, objet_table, profile_id)
       values ('support', 'lecture-dossier', 'recus', $1) returning id`, [profilAlice],
    )
    await c.query('update audit.acces set profile_id = null where id = $1', [rows[0]!.id])
    const vues = await asUser(c, alice, (x) =>
      x.query('select 1 from audit.acces where id = $1', [rows[0]!.id]),
    )
    expect(vues.rows).toEqual([])
    const parSupport = await commeSupport((x) =>
      x.query('select 1 from audit.acces where id = $1', [rows[0]!.id]),
    )
    expect(parSupport.rows).toHaveLength(1)
  })
})
