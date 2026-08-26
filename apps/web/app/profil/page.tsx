import { redirect } from 'next/navigation'
import { Module } from '@job-seeker/ui'
import { evaluerCompletude, resumer } from '@job-seeker/profil'
import type { Precision } from '@job-seeker/parsing/client'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'
import { CeQuiManque } from './CeQuiManque'
import { Competences, Experience, Identite } from './Formulaires'

export const metadata = { title: 'Profil — Cabine' }
export const dynamic = 'force-dynamic'

type LigneExperience = {
  id: string
  employeur: string
  intitule: string
  debut: string
  debut_precision: Precision
  fin: string | null
  fin_precision: Precision | null
  description: string | null
}

export default async function Profil({
  searchParams,
}: {
  searchParams: Promise<{ importe?: string }>
}) {
  // Vérification côté SERVEUR à chaque rendu. Le middleware a déjà redirigé,
  // mais un middleware peut être contourné : la page ne s'appuie pas dessus.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil')
  const { importe } = await searchParams

  const supabase = await clientServeur()
  // Une seule requête par table, filtrée par la RLS et non par un identifiant
  // que nous passerions : le cloisonnement vient de la base, pas de nous.
  const [profilRes, expRes, compRes, critRes, docRes] = await Promise.all([
    supabase.from('profiles').select('id, titre_accroche, fuseau, locale, autorisation_travail').single(),
    supabase.from('experiences').select('*').order('ordre').order('debut', { ascending: false }),
    supabase.from('competences').select('libelle').order('libelle'),
    supabase.from('criteres_recherche').select('intitules, presence, zones').order('version', { ascending: false }).limit(1),
    supabase.from('documents').select('id').eq('genre', 'cv_source').limit(1),
  ])

  const profil = profilRes.data
  if (profil === null) redirect('/connexion?next=%2Fprofil')

  const experiences = (expRes.data ?? []) as LigneExperience[]
  const competences = (compRes.data ?? []).map((c) => c.libelle as string)
  const criteres = critRes.data?.[0] ?? null

  const completude = evaluerCompletude(
    {
      titreAccroche: profil.titre_accroche,
      autorisationTravail: profil.autorisation_travail ?? [],
      experiences: experiences.length,
      competences: competences.length,
      aUnCv: (docRes.data ?? []).length > 0,
    },
    criteres === null
      ? null
      : { intitules: criteres.intitules ?? [], presence: criteres.presence ?? [], zones: criteres.zones ?? [] },
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
          Votre profil
        </h1>
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          C’est la seule description de vous dont je dispose. Tout ce que j’écrirai dans une
          candidature devra s’y trouver.
        </p>
      </div>

      {importe === '1' && (
        <p role="status" style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          ✓ Votre CV a été importé. Relisez ci-dessous ce qui en a été retenu.
        </p>
      )}

      <CeQuiManque completude={completude} resume={resumer(completude)} />

      <Identite
        profil={{
          titreAccroche: profil.titre_accroche,
          fuseau: profil.fuseau,
          locale: profil.locale,
          autorisationTravail: profil.autorisation_travail ?? [],
        }}
      />

      <Module titre="Parcours">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {experiences.map((e) => (
            <Experience
              key={e.id}
              experience={{
                id: e.id,
                employeur: e.employeur,
                intitule: e.intitule,
                debut: { iso: e.debut, precision: e.debut_precision },
                fin: e.fin === null ? null : { iso: e.fin, precision: e.fin_precision ?? 'annee' },
                description: e.description,
              }}
            />
          ))}
          <div style={{ borderTop: '1px solid var(--border-control)', paddingTop: 'var(--space-5)' }}>
            <Experience
              experience={{ id: null, employeur: '', intitule: '', debut: null, fin: null, description: null }}
            />
          </div>
        </div>
      </Module>

      <Competences libelles={competences} />

      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
        Chaque enregistrement conserve la version précédente, datée — c’est ce qui permet
        d’expliquer, six mois plus tard, pourquoi une offre vous a été proposée ce jour-là.
      </p>
    </main>
  )
}
