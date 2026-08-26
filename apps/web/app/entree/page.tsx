import { redirect } from 'next/navigation'
import { CRAN_PAR_DEFAUT, type Cran } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { Parcours } from './Parcours'

export const metadata = { title: 'Installation — Cabine' }
export const dynamic = 'force-dynamic'

export default async function Entree() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fentree')

  const supabase = await clientServeur()
  const [profilRes, docRes] = await Promise.all([
    supabase.from('profiles').select('cran_autonomie, parcours_termine_le').single(),
    supabase.from('documents').select('id').eq('genre', 'cv_source').limit(1),
  ])

  // Un parcours déjà terminé ne se refait pas : y revenir remettrait la garde
  // à zéro et rendrait le cadran inopérant sans que personne le demande.
  if (profilRes.data?.parcours_termine_le != null) redirect('/opportunites')

  return (
    <main
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: '640px',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
        Installation
      </h1>
      <Parcours
        aUnCv={(docRes.data ?? []).length > 0}
        cranInitial={(profilRes.data?.cran_autonomie as Cran | undefined) ?? CRAN_PAR_DEFAUT}
      />
    </main>
  )
}
