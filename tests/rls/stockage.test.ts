import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, creerCompte } from '@job-seeker/testing'
import { cheminStockage } from '@job-seeker/parsing'

/**
 * JOB-031 / constat F14 — le FICHIER, pas seulement la ligne qui le désigne.
 *
 * JOB-030 avait cloisonné la table `documents`. C'était insuffisant : cette
 * table ne contient qu'un chemin. Une ligne parfaitement cloisonnée qui pointe
 * vers un fichier lisible par tous ne protège rien — c'est le fichier qui porte
 * le CV, l'adresse et le numéro de téléphone.
 *
 * Le test décisif n'est pas « Bob ne voit pas le fichier d'Alice quand il liste
 * le bucket ». C'est « Bob ne voit pas le fichier d'Alice EN CONNAISSANT SON
 * CHEMIN EXACT » : un chemin fuit par un journal, une capture d'écran, une URL
 * partagée. Une garde qui ne tient que tant que le chemin est secret n'est pas
 * une garde.
 */

let c: pg.Client
let alice: string
let bob: string

const DOC_ALICE = '11111111-2222-4333-8444-555555555555'
const DOC_BOB = '66666666-7777-4888-8999-aaaaaaaaaaaa'

let cheminAlice: string
let cheminBob: string

/**
 * `storage.objects` porte un déclencheur qui refuse toute suppression directe
 * en SQL, sauf si ce réglage est posé. Ce n'est pas une garde d'autorisation —
 * c'est un garde-fou contre les fichiers orphelins, et l'API Storage le pose
 * elle-même à chaque suppression. On le pose donc ici pour tester ce qui garde
 * vraiment : la POLITIQUE. Un test qui prendrait ce déclencheur pour la
 * protection conclurait que le bucket est fermé alors qu'on ne l'aurait jamais
 * éprouvé.
 */
const AUTORISER_DELETE = "select set_config('storage.allow_delete_query', 'true', true)"

/** Dépose un objet en CONTOURNANT la RLS : c'est le montage, pas ce qu'on teste. */
const deposerEnAdmin = async (chemin: string, proprietaire: string): Promise<void> => {
  await c.query(
    `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
     values ('documents', $1, $2::uuid, $2::text, '{"mimetype":"application/pdf","size":1024}'::jsonb)
     on conflict do nothing`,
    [chemin, proprietaire],
  )
}

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@stockage.test'")
  await c.query(AUTORISER_DELETE.replace(', true)', ', false)'))
  await c.query("delete from storage.objects where bucket_id = 'documents'")
  alice = await creerCompte(c, 'alice@stockage.test')
  bob = await creerCompte(c, 'bob@stockage.test')
  cheminAlice = cheminStockage(alice, DOC_ALICE, 'pdf')
  cheminBob = cheminStockage(bob, DOC_BOB, 'pdf')
  await deposerEnAdmin(cheminAlice, alice)
  await deposerEnAdmin(cheminBob, bob)
}, 40_000)

afterAll(async () => {
  await c.query(AUTORISER_DELETE.replace(', true)', ', false)'))
  await c.query("delete from storage.objects where bucket_id = 'documents'")
  await c.query("delete from auth.users where email like '%@stockage.test'")
  await c.end()
})

describe('le bucket lui-même', () => {
  it("n'est pas public — l'absence de politique s'y lirait « tout le monde »", async () => {
    const { rows } = await c.query<{ public: boolean; file_size_limit: string | null }>(
      "select public, file_size_limit from storage.buckets where id = 'documents'",
    )
    expect(rows[0]?.public).toBe(false)
    expect(Number(rows[0]?.file_size_limit)).toBe(10 * 1024 * 1024)
  })

  it('ne laisse passer que le PDF et le .docx', async () => {
    const { rows } = await c.query<{ allowed_mime_types: string[] }>(
      "select allowed_mime_types from storage.buckets where id = 'documents'",
    )
    expect(rows[0]?.allowed_mime_types).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])
  })

  it('porte au moins une politique par opération — un vide n’est pas un refus', async () => {
    const { rows } = await c.query<{ cmd: string }>(
      `select distinct cmd from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname like 'documents —%'`,
    )
    expect(new Set(rows.map((r) => r.cmd))).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']))
  })
})

describe('ALLOW — le propriétaire', () => {
  it('lit son propre fichier', async () => {
    const { rows } = await asUser(c, alice, (x) =>
      x.query("select name from storage.objects where bucket_id = 'documents'"),
    )
    expect(rows.map((r: { name: string }) => r.name)).toEqual([cheminAlice])
  })

  it('dépose dans son propre dossier', async () => {
    const autre = cheminStockage(alice, '99999999-8888-4777-8666-555555555555', 'docx')
    await asUser(c, alice, async (x) => {
      await x.query(
        `insert into storage.objects (bucket_id, name, owner, owner_id)
         values ('documents', $1, $2::uuid, $2::text)`,
        [autre, alice],
      )
    })
  })

  it('supprime son propre fichier', async () => {
    // Divergence assumée avec le reste du modèle, où aucun rôle client n'a
    // DELETE : l'interdiction de JOB-030 protège REQ-014 (arrêter
    // l'automatisation avant d'effacer), et un CV n'automatise rien. Refuser
    // ici, ce serait empêcher quelqu'un de retirer un document personnel
    // envoyé par erreur — un défaut de confidentialité, pas une protection.
    const jetable = cheminStockage(alice, '12121212-3434-4565-8787-909090909090', 'pdf')
    await deposerEnAdmin(jetable, alice)
    const { rowCount } = await asUser(c, alice, async (x) => {
      await x.query(AUTORISER_DELETE)
      return x.query('delete from storage.objects where name = $1', [jetable])
    })
    expect(rowCount).toBe(1)
  })
})

describe('DENY — connaître le chemin exact ne suffit pas', () => {
  it("Bob ne lit pas le fichier d'Alice, même en le nommant", async () => {
    const { rows } = await asUser(c, bob, (x) =>
      x.query("select name from storage.objects where bucket_id = 'documents' and name = $1", [
        cheminAlice,
      ]),
    )
    expect(rows).toEqual([])
  })

  it("Bob ne dépose pas dans le dossier d'Alice", async () => {
    await expect(
      asUser(c, bob, (x) =>
        x.query(
          `insert into storage.objects (bucket_id, name, owner, owner_id)
           values ('documents', $1, $2::uuid, $2::text)`,
          [cheminStockage(alice, '31313131-4141-4515-8161-717171717171', 'pdf'), bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it("Bob ne renomme pas SON fichier vers le dossier d'Alice", async () => {
    // Le cas que USING seul laisserait passer : Bob a le droit de toucher la
    // ligne de départ, et sans WITH CHECK plus rien ne contrôle l'arrivée. Le
    // fichier atterrirait chez Alice, dont la politique de lecture le lui
    // donnerait alors — Bob se serait offert un dépôt dans un dossier fermé.
    await expect(
      asUser(c, bob, (x) =>
        x.query('update storage.objects set name = $1 where name = $2', [
          cheminStockage(alice, DOC_BOB, 'pdf'),
          cheminBob,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it("Bob ne supprime pas le fichier d'Alice", async () => {
    const { rowCount } = await asUser(c, bob, async (x) => {
      await x.query(AUTORISER_DELETE)
      return x.query('delete from storage.objects where name = $1', [cheminAlice])
    })
    // Zéro ligne, pas une erreur : la politique rend la ligne INVISIBLE, donc
    // le DELETE ne trouve rien. Le fichier doit toujours être là.
    expect(rowCount).toBe(0)
    const { rows } = await c.query('select 1 from storage.objects where name = $1', [cheminAlice])
    expect(rows).toHaveLength(1)
  })

  it('un visiteur non authentifié ne voit rien du tout', async () => {
    const { rows } = await asAnon(c, (x) =>
      x.query("select name from storage.objects where bucket_id = 'documents'"),
    )
    expect(rows).toEqual([])
  })
})
