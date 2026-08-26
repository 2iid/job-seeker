import { redirect } from 'next/navigation'
import { evaluerCompletude, resumer } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { CeQuiManque } from '../profil/CeQuiManque'
import { Criteres, Exclusions } from './Formulaires'

export const metadata = { title: 'Vos critères — Cabine' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Vérification côté SERVEUR à chaque rendu. Le middleware a déjà redirigé,
  // mais un middleware peut être contourné : la page ne s'appuie pas dessus.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fcriteres')

  const supabase = await clientServeur()
  const [profilRes, critRes, exclRes, expRes, compRes, docRes, histRes] = await Promise.all([
    supabase.from('profiles').select('id, titre_accroche, autorisation_travail').single(),
    supabase.from('criteres_recherche').select('*').order('version', { ascending: false }).limit(1),
    supabase.from('employeurs_exclus').select('id, employeur_canonique, motif').order('employeur_canonique'),
    supabase.from('experiences').select('id'),
    supabase.from('competences').select('libelle'),
    supabase.from('documents').select('id').eq('genre', 'cv_source').limit(1),
    supabase.from('criteres_recherche').select('version, created_at').order('version', { ascending: false }),
  ])

  const profil = profilRes.data
  if (profil === null) redirect('/connexion?next=%2Fcriteres')

  const c = critRes.data?.[0] ?? null
  const historique = histRes.data ?? []

  const completude = evaluerCompletude(
    {
      titreAccroche: profil.titre_accroche,
      autorisationTravail: profil.autorisation_travail ?? [],
      experiences: (expRes.data ?? []).length,
      competences: (compRes.data ?? []).length,
      aUnCv: (docRes.data ?? []).length > 0,
    },
    c === null ? null : { intitules: c.intitules ?? [], presence: c.presence ?? [], zones: c.zones ?? [] },
  )

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
      <div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Vos critères
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          C’est la cible sur laquelle je travaille. Chaque enregistrement écrit une nouvelle version :
          je peux donc vous dire, six mois plus tard, selon quels critères une offre vous a été
          proposée ce jour-là.
        </p>
      </div>

      <CeQuiManque completude={completude} resume={resumer(completude)} />

      <Criteres
        courants={{
          version: c?.version ?? null,
          intitules: c?.intitules ?? [],
          seniorite: c?.seniorite ?? null,
          presence: c?.presence ?? [],
          zones: c?.zones ?? [],
          salaireMin: c?.salaire_min_unites_mineures ?? null,
          salaireDevise: c?.salaire_devise ?? null,
          secteurs: c?.secteurs ?? [],
          langues: c?.langues ?? [],
          motsRedhibitoires: c?.mots_redhibitoires ?? [],
        }}
      />

      <Exclusions
        employeurs={(exclRes.data ?? []).map((e) => ({
          id: e.id as string,
          nom: e.employeur_canonique as string,
          motif: (e.motif as string | null) ?? null,
        }))}
      />

      {historique.length > 1 && (
        <details style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            {historique.length} versions enregistrées
          </summary>
          <ul style={{ margin: 'var(--space-2) 0 0', paddingLeft: 'var(--space-5)' }}>
            {historique.map((v) => (
              <li key={v.version as number} style={{ padding: 'var(--space-1) 0' }}>
                Version {v.version as number} — {new Date(v.created_at as string).toLocaleDateString('fr-FR')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  )
}
