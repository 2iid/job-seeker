import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, creerCompte } from '@job-seeker/testing'

/**
 * JOB-030 — l'autorisation sur tout le modèle, prouvée contre la vraie base.
 *
 * Les tables filles n'ont pas de `user_id` : leur appartenance passe par le
 * profil. C'est exactement le genre de politique qui a l'air juste et qui
 * laisse tout lire — d'où un test de refus par table, sans exception.
 */

let c: pg.Client
let alice: string
let bob: string
let profilAlice: string
let profilBob: string

const profilDe = async (userId: string): Promise<string> => {
  const { rows } = await c.query<{ id: string }>('select id from public.profiles where user_id = $1', [userId])
  const id = rows[0]?.id
  if (id === undefined) throw new Error('profil introuvable')
  return id
}

const TABLES_FILLES = [
  'experiences', 'formations', 'competences', 'documents',
  'criteres_recherche', 'employeurs_exclus', 'candidatures',
] as const

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@modele.test'")
  alice = await creerCompte(c, 'alice@modele.test')
  bob = await creerCompte(c, 'bob@modele.test')
  profilAlice = await profilDe(alice)
  profilBob = await profilDe(bob)
  await c.query("insert into public.candidatures (profile_id, employeur, intitule, url_offre, source, palier) values ($1,'Qonto','PM','https://x.test/1','ashby','a')", [profilAlice])
  await c.query("insert into public.candidatures (profile_id, employeur, intitule, url_offre, source, palier) values ($1,'Swile','PM','https://x.test/2','ashby','a')", [profilBob])
  await c.query("insert into public.experiences (profile_id, employeur, intitule, debut) values ($1,'Payfit','Designer','2021-01-01')", [profilAlice])
  await c.query("insert into public.experiences (profile_id, employeur, intitule, debut) values ($1,'Alan','PM','2020-01-01')", [profilBob])
}, 40_000)

afterAll(async () => {
  await c.query("delete from auth.users where email like '%@modele.test'")
  await c.end()
})

describe('chaque table fille est cloisonnée', () => {
  it.each(TABLES_FILLES)('ALLOW/DENY : %s ne laisse voir que ses propres lignes', async (table) => {
    const vues = await asUser(c, alice, (x) =>
      x.query(`select profile_id from public.${table}`),
    )
    for (const r of vues.rows as { profile_id: string }[]) {
      expect(r.profile_id, `${table} laisse voir une ligne d'autrui`).toBe(profilAlice)
    }
    // Et explicitement : rien de Bob n'est atteignable, même en le nommant.
    const cible = await asUser(c, alice, (x) =>
      x.query(`select 1 from public.${table} where profile_id = $1`, [profilBob]),
    )
    expect(cible.rows, `${table} laisse lire les lignes de Bob`).toEqual([])
  })

  it.each(TABLES_FILLES)('DENY : %s refuse une insertion au nom d’autrui', async (table) => {
    const colonnes: Record<string, string> = {
      experiences: "(profile_id, employeur, intitule, debut) values ($1,'X','Y','2020-01-01')",
      formations: "(profile_id, etablissement, intitule) values ($1,'X','Y')",
      competences: "(profile_id, libelle) values ($1,'Figma')",
      documents: "(profile_id, genre, chemin_stockage, type_mime, taille_octets) values ($1,'cv_source','p','application/pdf',100)",
      criteres_recherche: '(profile_id, version) values ($1, 99)',
      employeurs_exclus: "(profile_id, employeur_canonique) values ($1,'x')",
      candidatures: "(profile_id, employeur, intitule, url_offre, source, palier) values ($1,'X','Y','https://z.test/9','s','a')",
    }
    await expect(
      asUser(c, alice, (x) => x.query(`insert into public.${table} ${colonnes[table]}`, [profilBob])),
      `${table} accepte une insertion au nom de Bob`,
    ).rejects.toThrow(/row-level security/i)
  })

  it.each(TABLES_FILLES)('DENY : %s est fermée à l’anonyme', async (table) => {
    await expect(asAnon(c, (x) => x.query(`select 1 from public.${table}`))).rejects.toThrow(
      /permission denied/i,
    )
  })

  // La liste s'est SCINDÉE avec le constat F22 (JOB-034), et la scission est
  // la décision, pas un assouplissement.
  //
  // L'interdiction posée par JOB-030 protégeait REQ-014 : arrêter
  // l'automatisation avant d'effacer. Cela vise la suppression du COMPTE. Ce
  // n'est pas une raison d'empêcher quelqu'un de retirer une expérience saisie
  // par erreur — sur de la donnée personnelle, c'est un défaut de maîtrise et
  // non une protection.
  //
  // Ce qui reste fermé l'est pour une raison qui, elle, tient : une version
  // effaçable ne prouve rien, et une candidature envoyée a EU LIEU — la
  // retirer de la base ne la retire pas de la boîte mail du recruteur.
  const INEFFACABLES = ['criteres_recherche', 'candidatures'] as const

  it.each(INEFFACABLES)('DENY : personne ne supprime dans %s', async (table) => {
    await expect(
      asUser(c, alice, (x) => x.query(`delete from public.${table} where profile_id = $1`, [profilAlice])),
    ).rejects.toThrow(/permission denied/i)
  })

  // `documents` reste sans DELETE côté base : le fichier vit dans le bucket,
  // et retirer la ligne sans le fichier laisserait un CV orphelin que plus
  // rien ne désigne. Le retrait des deux ensemble est le constat F20, porté
  // par JOB-057 avec la rétention.
  it('DENY : personne ne supprime dans documents — le fichier survivrait à sa ligne', async () => {
    await expect(
      asUser(c, alice, (x) => x.query('delete from public.documents where profile_id = $1', [profilAlice])),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('les critères sont versionnés, pas modifiés', () => {
  it('ALLOW : on écrit une nouvelle version', async () => {
    const r = await asUser(c, alice, (x) =>
      x.query(
        "insert into public.criteres_recherche (profile_id, version, intitules) values ($1, 1, array['Product Manager']) returning version",
        [profilAlice],
      ),
    )
    expect(r.rows[0]).toMatchObject({ version: 1 })
  })

  it('DENY : une version déjà écrite ne se modifie pas', async () => {
    // Un UPDATE effacerait l'explication de pourquoi une offre a matché à un
    // instant donné — exactement ce que REQ-002 demande de conserver.
    await expect(
      asUser(c, alice, (x) =>
        x.query("update public.criteres_recherche set seniorite = 'senior' where profile_id = $1", [
          profilAlice,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('DENY : deux fois la même version est refusé', async () => {
    await c.query(
      'insert into public.criteres_recherche (profile_id, version) values ($1, 7) on conflict do nothing',
      [profilAlice],
    )
    await expect(
      c.query('insert into public.criteres_recherche (profile_id, version) values ($1, 7)', [profilAlice]),
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

describe('les invariants que la base tient elle-même', () => {
  it('une candidature ne peut pas exister deux fois pour la même offre', async () => {
    await expect(
      c.query(
        "insert into public.candidatures (profile_id, employeur, intitule, url_offre, source, palier) values ($1,'Qonto','PM','https://x.test/1','autre','b')",
        [profilAlice],
      ),
      'la même offre a produit deux candidatures',
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('un document au-delà de 10 Mo est refusé par la base', async () => {
    await expect(
      c.query(
        "insert into public.documents (profile_id, genre, chemin_stockage, type_mime, taille_octets) values ($1,'cv_source','p','application/pdf',$2)",
        [profilAlice, 11 * 1024 * 1024],
      ),
    ).rejects.toThrow(/check constraint/i)
  })

  it('une expérience qui finit avant de commencer est refusée', async () => {
    await expect(
      c.query(
        "insert into public.experiences (profile_id, employeur, intitule, debut, fin) values ($1,'X','Y','2024-01-01','2023-01-01')",
        [profilAlice],
      ),
    ).rejects.toThrow(/check constraint/i)
  })

  it('un score hors de 0–100 est refusé', async () => {
    await expect(
      c.query(
        "insert into public.candidatures (profile_id, employeur, intitule, url_offre, source, palier, score) values ($1,'X','Y','https://x.test/999','s','a',140)",
        [profilAlice],
      ),
    ).rejects.toThrow(/check constraint/i)
  })
})
