import { redirect } from 'next/navigation'
import { utilisateurCourant } from '@/lib/supabase/server'

export const metadata = { title: 'Profil — Cabine' }
export const dynamic = 'force-dynamic'

export default async function Profil() {
  // Vérification côté SERVEUR à chaque rendu. Le middleware a déjà redirigé,
  // mais un middleware peut être contourné : la page ne s'appuie pas dessus.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil')

  return (
    <main style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>Votre profil</h1>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
        Connectée en tant que <strong style={{ fontWeight: 600 }}>{utilisateur.email}</strong>.
      </p>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
        JOB-006 · l’identité est vérifiée auprès du serveur d’authentification, pas lue dans un cookie
      </p>
    </main>
  )
}
