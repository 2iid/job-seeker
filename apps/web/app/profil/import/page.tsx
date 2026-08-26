import { redirect } from 'next/navigation'
import { utilisateurCourant } from '@/lib/supabase/server'
import { Formulaire } from './Formulaire'

export const metadata = { title: 'Importer votre CV — Cabine' }
export const dynamic = 'force-dynamic'

export default async function Import() {
  // Vérification côté SERVEUR à chaque rendu. Le middleware a déjà redirigé,
  // mais un middleware peut être contourné : la page ne s'appuie pas dessus.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil%2Fimport')

  return (
    <main
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: '720px',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Importer votre CV
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Nous lisons votre CV pour vous proposer un profil. Vous relisez, vous corrigez, et vous seul
          décidez de ce qui est enregistré.
        </p>
      </div>
      <Formulaire />
    </main>
  )
}
