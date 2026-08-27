import { describe, expect, it, vi } from 'vitest'
import { enregistrer, statutPour } from './enregistrer.ts'
import type { Issue } from './envoyer.ts'

const refus = (motif: string): Issue => ({ type: 'refuse', motif, explication: '' })

describe('issue → statut : « que doit faire la personne maintenant ? »', () => {
  it('un dossier prêt devient « prete-a-envoyer », l’issue nominale de l’ADR-0003', () => {
    expect(statutPour({ type: 'prepare', annonce: '', pret: true })).toBe('prete-a-envoyer')
  })

  it('un dossier INCOMPLET reste « en-file » et n’est jamais dit prêt', () => {
    // Le mensonge le plus coûteux du système serait ici : quelqu'un cliquerait
    // « envoyer » sur une lettre tronquée.
    expect(statutPour({ type: 'prepare', annonce: '', pret: false })).toBe('en-file')
  })

  it('une issue incertaine n’est PAS une escalade', () => {
    // Une escalade dit « je n'ai pas pu ». Ici la phrase est « je ne sais
    // pas », et elle appelle une vérification chez le destinataire.
    expect(statutPour({ type: 'incertain', explication: '' })).toBe('incertaine')
  })

  it('un refus PASSAGER ne réveille personne', () => {
    // Envoyer quelqu'un vérifier parce que son quota du jour est atteint use la
    // seule chose qu'une escalade possède : le fait qu'elle soit rare.
    for (const m of ['quota-atteint', 'hors-plage', 'arret-urgence', 'suppression-en-cours'])
      expect(statutPour(refus(m)), m).toBe('en-file')
  })

  it('un refus qui demande une décision humaine escalade', () => {
    for (const m of ['destination-non-verifiee', 'dossier-incomplet', 'mandat-absent'])
      expect(statutPour(refus(m)), m).toBe('escalade')
  })

  it('un envoi réussi devient « envoyee »', () => {
    expect(statutPour({
      type: 'envoye', adresse: 'a@b.fr',
      confirmation: { reference: 'r', recuLe: 'x' },
      cranAuMoment: 'agir-seul', mandatId: null,
    })).toBe('envoyee')
  })

  it('un motif INCONNU escalade plutôt que de disparaître en file', () => {
    // Le défaut penche vers « quelqu'un doit regarder ». Un motif ajouté demain
    // et oublié ici ne doit pas devenir silencieusement une attente sans fin.
    expect(statutPour(refus('motif-invente-demain'))).toBe('escalade')
  })
})

describe('enregistrer — la transaction', () => {
  /** Un client feint : on observe la SUITE d'ordres, pas leur effet. */
  const clientQui = (echoueSur: RegExp | null) => {
    const vus: string[] = []
    const query = vi.fn(async (sql: string) => {
      vus.push(sql.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase())
      if (echoueSur !== null && echoueSur.test(sql)) throw new Error('échec simulé')
      return { rows: [], rowCount: 0 }
    })
    return { vus, db: { query } as never }
  }

  const ENTREE = {
    profileId: 'p', opportuniteId: 'o', canal: 'email' as const,
    dossier: { opportuniteId: 'o', canal: 'email' as const, pieces: [], questionsSansReponse: [] },
    etat: { pret: true as const },
    issue: { type: 'prepare' as const, annonce: '', pret: true },
  }

  it('valide quand tout passe', async () => {
    const { vus, db } = clientQui(null)
    await enregistrer(db, ENTREE)
    expect(vus[0]).toBe('begin')
    expect(vus.at(-1)).toBe('commit')
    expect(vus).not.toContain('rollback')
  })

  it('ANNULE quand le SECOND ordre échoue — le cas que la base ne peut pas simuler', async () => {
    // C'est ici que la propriété est réellement prouvée. En base, la clé
    // étrangère fait échouer le PREMIER ordre, donc il n'y a jamais rien à
    // annuler : le test y passait sans rien vérifier. Sans `begin`/`rollback`,
    // on obtiendrait un dossier « envoyé » sur une opportunité restée en file.
    const { vus, db } = clientQui(/update public\.opportunites/)
    await expect(enregistrer(db, ENTREE)).rejects.toThrow('échec simulé')
    expect(vus).toContain('rollback')
    expect(vus).not.toContain('commit')
  })

  it('relaie l’erreur au lieu de l’avaler', async () => {
    // Une écriture qui échoue en silence est pire qu'une écriture qui manque :
    // la file croirait le travail terminé.
    const { db } = clientQui(/insert into public\.dossiers/)
    await expect(enregistrer(db, ENTREE)).rejects.toThrow('échec simulé')
  })
})
