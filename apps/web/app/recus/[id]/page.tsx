import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export const metadata = { title: 'Reçu — Cabine' }
export const dynamic = 'force-dynamic'

/**
 * Un reçu, en entier.
 *
 * ── Pourquoi le texte est affiché tel quel, sans mise en forme ──
 *
 * Ce que la personne lit ici doit être ce que le recruteur a reçu, au caractère
 * près. Reformater — puces, titres, coupures — donnerait un document qui LUI
 * ressemble sans être lui, et c'est exactement l'écart qui rend une preuve
 * inutile le jour où elle sert.
 */

type Recu = {
  id: string
  canal: string
  resultat: string
  envoye_le: string
  cv_texte: string
  message_texte: string | null
  cran_au_moment: string
  opportunites: { offres: { titre: string; employeur_affiche: string } } | null
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full', timeStyle: 'short',
})

const CADRE: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  fontFamily: 'var(--police-mono, ui-monospace, monospace)',
  fontSize: '13px',
  lineHeight: 1.6,
  border: '1px solid var(--trait)',
  padding: 'var(--space-4)',
  margin: 0,
  overflowX: 'auto',
}

export default async function UnRecu({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Frecus')

  const { id } = await params
  const supabase = await clientServeur()
  // Aucun filtre sur le propriétaire ici : la RLS le fait, et le faire AUSSI
  // en application donnerait l'illusion que c'est elle qui protège. Un reçu
  // qui n'est pas le vôtre ne revient tout simplement pas.
  const { data } = await supabase
    .from('recus')
    .select(
      'id, canal, resultat, envoye_le, cv_texte, message_texte, cran_au_moment, opportunites(offres(titre, employeur_affiche))',
    )
    .eq('id', id)
    .maybeSingle<Recu>()

  if (data === null) notFound()

  return (
    <main style={{ maxWidth: '52rem', margin: '0 auto', padding: 'var(--space-5) var(--space-4)' }}>
      <Link href="/recus" style={{ fontSize: '13px', color: 'var(--accent-machine)' }}>
        ← Tout ce qui est parti
      </Link>

      <h1 style={{ fontSize: '22px', margin: 'var(--space-3) 0 var(--space-2)' }}>
        {data.opportunites?.offres.titre ?? 'Offre supprimée'}
      </h1>
      <p style={{ margin: '0 0 var(--space-4)', fontSize: '14px', color: 'var(--texte-secondaire)' }}>
        {data.opportunites?.offres.employeur_affiche ?? '—'}
        {' · '}
        <time dateTime={data.envoye_le}>{DATE.format(new Date(data.envoye_le))}</time>
        {` · par ${data.canal} · ${data.resultat}`}
      </p>

      <p style={{ margin: '0 0 var(--space-5)', fontSize: '13px' }}>
        {/* Le cran est là parce qu'il répond à « pourquoi est-ce parti ? »,
            question qu'on se pose seulement quand on est surpris que ce soit
            parti — donc au pire moment pour aller chercher l'information. */}
        Au moment de cet envoi, votre réglage sur ce canal était{' '}
        <strong>{data.cran_au_moment}</strong>.
      </p>

      <h2 style={{ fontSize: '15px', margin: '0 0 var(--space-2)' }}>Le CV envoyé</h2>
      <pre style={CADRE}>{data.cv_texte}</pre>

      {data.message_texte !== null && data.message_texte.trim() !== '' ? (
        <>
          <h2 style={{ fontSize: '15px', margin: 'var(--space-5) 0 var(--space-2)' }}>
            Le message envoyé
          </h2>
          <pre style={CADRE}>{data.message_texte}</pre>
        </>
      ) : null}

      <p style={{ marginTop: 'var(--space-5)' }}>
        <a href={`/recus/${data.id}/export`} download style={{ fontSize: '13px', color: 'var(--accent-machine)' }}>
          Télécharger ce reçu
        </a>
      </p>
    </main>
  )
}
