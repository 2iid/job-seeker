import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { compter, preparer } from '@job-seeker/documents'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { Difference } from './Difference'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Votre document — Cabine' }

/**
 * JOB-041 — relire ce qui a été changé, avant que ça parte.
 *
 * L'écran annonce le NOMBRE de modifications en tête. Sans lui, on fait
 * défiler ; avec lui, on sait combien de décisions on a à prendre, et on les
 * prend. C'est la même raison qui fait annoncer les champs « à vérifier » sur
 * l'écran d'import : un compte transforme une lecture en une tâche finie.
 */

type Document = {
  origine: { champ: string; texte: string }[]
  propose: { champ: string; texte: string }[]
}

export default async function DocumentAdapte({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await utilisateurCourant()
  const { id } = await params
  if (utilisateur === null) redirect(`/connexion?next=%2Fopportunites%2F${encodeURIComponent(id)}%2Fdocument`)

  const supabase = await clientServeur()
  const { data } = await supabase
    .from('opportunites')
    .select('id, modifications_refusees, document_fige, offres!inner(titre, employeur_affiche)')
    .eq('id', id)
    .maybeSingle()
  if (data === null) notFound()

  const fige = data.document_fige as Document | null
  const offre = data.offres as unknown as { titre: string; employeur_affiche: string }

  if (fige === null) {
    return (
      <main style={{ padding: 'var(--space-6)', maxWidth: '760px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Aucun document préparé</h1>
        {/* REQ-003 : une absence s'explique. « Rien ici » laisserait conclure
            à une panne, alors que c'est simplement pas encore fait. */}
        <p style={{ margin: 'var(--space-3) 0 0', fontSize: '15px', color: 'var(--text-secondary)' }}>
          Je n’ai pas encore adapté votre CV pour cette offre. Cela se fait au moment où vous décidez
          de postuler — je ne prépare pas de dossier tant que vous ne l’avez pas demandé.
        </p>
        <p style={{ margin: 'var(--space-4) 0 0' }}>
          <Link href={`/opportunites/${id}`} style={{ fontSize: '14px' }}>← Revenir à l’offre</Link>
        </p>
      </main>
    )
  }

  const refusees = Array.isArray(data.modifications_refusees)
    ? (data.modifications_refusees as string[])
    : []

  const champs = fige.origine.map((o) => ({
    champ: o.champ,
    origine: o.texte,
    propose: fige.propose.find((p) => p.champ === o.champ)?.texte ?? o.texte,
  }))
  const revision = preparer(champs, refusees)
  const c = compter(revision)

  return (
    <main
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: '760px',
      }}
    >
      <Link
        href={`/opportunites/${id}`}
        style={{ fontSize: '13px', color: 'var(--text-secondary)', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}
      >
        ← {offre.titre} · {offre.employeur_affiche}
      </Link>

      <div>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Ce que j’ai changé dans votre CV
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '15px', color: 'var(--text-secondary)' }}>
          {/* Le compte AVANT la liste : sans lui on fait défiler, avec lui on
              sait combien de décisions on a à prendre. */}
          {c.total === 0 ? (
            'Je n’ai rien changé : votre CV répond déjà à cette offre tel quel.'
          ) : (
            <>
              <strong style={{ fontWeight: 600 }}>{c.total} modification{c.total > 1 ? 's' : ''}</strong>
              {c.refusees > 0 && ` — dont ${c.refusees} que vous avez déjà écartée${c.refusees > 1 ? 's' : ''}`}.
              {' '}Écartez tout ce que vous ne tiendriez pas en entretien : votre texte d’origine est
              conservé.
            </>
          )}
        </p>
      </div>

      <Difference opportuniteId={id} differences={revision.differences} refusees={refusees} />
    </main>
  )
}
