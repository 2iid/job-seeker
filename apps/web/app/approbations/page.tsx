import { redirect } from 'next/navigation'
import { Vide } from '@job-seeker/ui'
import { enAttente } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { archiverExpirees } from './actions'
import { Element, type Proposition } from './Element'

export const metadata = { title: 'À approuver — Cabine' }
export const dynamic = 'force-dynamic'

type Ligne = {
  id: string
  score: number | null
  correspondances: unknown
  manques: unknown
  citations_rejetees: number
  statut: string
  approbation_expire_le: string | null
  archivee_le: string | null
  offres: { titre: string; employeur_affiche: string }
}

const preuves = (v: unknown): { libelle: string; citation: string }[] =>
  Array.isArray(v)
    ? v.flatMap((p) => {
        const o = p as Record<string, unknown>
        return typeof o?.['libelle'] === 'string' && typeof o?.['citation'] === 'string'
          ? [{ libelle: o['libelle'], citation: o['citation'] }]
          : []
      })
    : []

export default async function Approbations() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fapprobations')

  // Archiver AVANT d'afficher. Un élément expiré ne doit jamais apparaître
  // comme décidable : faire cliquer quelqu'un sur un bouton sans effet est une
  // façon de lui mentir.
  const archivees = await archiverExpirees()

  const supabase = await clientServeur()
  const { data } = await supabase
    .from('opportunites')
    .select(
      'id, score, correspondances, manques, citations_rejetees, statut, approbation_expire_le, ' +
        'archivee_le, offres!inner(titre, employeur_affiche)',
    )
    .eq('exclue', false)
    .is('archivee_le', null)
    .eq('statut', 'detectee')
    .order('score', { ascending: false, nullsFirst: false })

  const lignes = (data ?? []) as unknown as Ligne[]
  const attente = enAttente(
    lignes.map((l) => ({
      id: l.id, statut: l.statut, expireLe: l.approbation_expire_le, archiveeLe: l.archivee_le,
    })),
  )
  const parId = new Map(lignes.map((l) => [l.id, l]))

  const propositions: Proposition[] = attente.flatMap((e) => {
    const l = parId.get(e.id)
    if (l === undefined) return []
    return [{
      id: l.id,
      titre: l.offres.titre,
      employeur: l.offres.employeur_affiche,
      score: l.score,
      correspondances: preuves(l.correspondances),
      manques: preuves(l.manques),
      citationsRejetees: l.citations_rejetees,
      expireLe: l.approbation_expire_le,
    }]
  })

  return (
    <main
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        maxWidth: '680px',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          À approuver
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Rien ne part sans vous. <kbd>A</kbd> pour envoyer, <kbd>R</kbd> pour écarter.
        </p>
      </div>

      {archivees > 0 && (
        // Jamais en silence : REQ-010 exige que l'archivage soit dit.
        <p role="status" style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          {archivees} offre{archivees > 1 ? 's' : ''} {archivees > 1 ? 'ont' : 'a'} expiré avant que vous
          ne décidiez. {archivees > 1 ? 'Elles n’ont pas été envoyées.' : 'Elle n’a pas été envoyée.'}
        </p>
      )}

      {propositions.length === 0 ? (
        <Vide
          titre="Rien ne vous attend."
          explication="Je continue à chercher. Ce qui mérite votre décision apparaîtra ici — vous n’avez rien à surveiller."
          action={{ libelle: 'Voir mes opportunités', href: '/opportunites' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {propositions.map((p, i) => (
            <Element key={p.id} p={p} rang={i + 1} sur={propositions.length} />
          ))}
        </div>
      )}
    </main>
  )
}
