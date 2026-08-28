import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Module, Vide } from '@job-seeker/ui'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export const metadata = { title: 'Ce qui est parti — Cabine' }
export const dynamic = 'force-dynamic'

/**
 * JOB-056 / REQ-013 — « le reçu est consultable et exportable par son
 * propriétaire ».
 *
 * ── La décision de fond de cet écran ──
 *
 * Une page de preuves qui ne montrerait QUE les preuves se lirait comme
 * complète alors qu'elle ne l'est pas. Les incidents de JOB-055 — « une
 * candidature est peut-être partie et je n'en ai pas la preuve » — sont donc
 * ici, en tête, et non relégués ailleurs.
 *
 * C'est le contraire du réflexe : on range les mauvaises nouvelles dans un
 * onglet à part, et la page principale a l'air d'aller bien. Mais quelqu'un qui
 * vient vérifier ce qui est parti en son nom vient précisément pour les trous.
 */

type LigneRecu = {
  id: string
  canal: string
  resultat: string
  envoye_le: string
  opportunites: { offres: { titre: string; employeur_affiche: string } } | null
}

type LigneIncident = {
  id: string
  genre: string
  constat: string
  conduite: string
  detecte_le: string
}

/**
 * Les valeurs de la base sont des mots de machine. Les afficher telles quelles
 * — « envoye », « ats » — fait lire à quelqu'un le vocabulaire interne du
 * produit, sur l'écran qui doit justement lui rendre des comptes.
 */
const CANAL: Record<string, string> = {
  email: 'par courriel',
  ats: 'par le formulaire de l’employeur',
  formulaire: 'par formulaire',
}
const RESULTAT: Record<string, string> = {
  envoye: 'remis',
  refuse: 'refusé',
  incertain: 'issue inconnue',
  prepare: 'préparé',
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default async function Recus() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Frecus')

  const supabase = await clientServeur()
  // Deux requêtes plutôt qu'une jointure : ce sont deux choses différentes, et
  // les mélanger en base rendrait plus difficile de les distinguer à l'écran —
  // or c'est justement la distinction qui compte ici.
  const [{ data: recus }, { data: incidents }] = await Promise.all([
    supabase
      .from('recus')
      // `cv_texte` n'est PAS demandé : la liste ne l'affiche pas. Le charger
      // ferait transiter le CV complet de deux cents candidatures pour ne rien
      // en montrer — la donnée la plus lourde du produit, tirée pour rien.
      // Un contenu qu'on ne montre pas est un contenu qu'on ne demande pas.
      .select('id, canal, resultat, envoye_le, opportunites(offres(titre, employeur_affiche))')
      .order('envoye_le', { ascending: false })
      .limit(200)
      .returns<LigneRecu[]>(),
    supabase
      .from('incidents')
      .select('id, genre, constat, conduite, detecte_le')
      .is('clos_le', null)
      .order('detecte_le', { ascending: false })
      .returns<LigneIncident[]>(),
  ])

  const lignes = recus ?? []
  const trous = incidents ?? []

  return (
    <main style={{ maxWidth: '52rem', margin: '0 auto', padding: 'var(--space-5) var(--space-4)' }}>
      <h1 style={{ fontSize: '24px', margin: '0 0 var(--space-2)' }}>Ce qui est parti en votre nom</h1>
      <p style={{ margin: '0 0 var(--space-5)', color: 'var(--texte-secondaire)', fontSize: '14px' }}>
        Chaque envoi laisse une preuve de son contenu exact. Elle ne change jamais, même si votre
        profil change ensuite.
      </p>

      {trous.length > 0 ? (
        <section
          aria-labelledby="trous"
          style={{
            border: '1px solid var(--accent-critique)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <h2 id="trous" style={{ fontSize: '15px', margin: '0 0 var(--space-3)' }}>
            {trous.length === 1
              ? 'Une candidature dont je n’ai pas la preuve'
              : `${String(trous.length)} candidatures dont je n’ai pas la preuve`}
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
            {trous.map((t) => (
              <li key={t.id}>
                <p style={{ margin: '0 0 var(--space-1)', fontSize: '14px' }}>{t.constat}</p>
                {/* La conduite à tenir, jamais séparée du constat : un incident
                    sans quoi-faire est une angoisse sans issue. */}
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--texte-secondaire)' }}>
                  {t.conduite}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Module
        titre="Reçus"
        actions={
          lignes.length > 0 ? (
            <a
              href="/recus/export"
              style={{ fontSize: '13px', color: 'var(--accent-machine)' }}
              download
            >
              Tout exporter
            </a>
          ) : null
        }
      >
        {lignes.length === 0 ? (
          <Vide
            titre="Rien n’est encore parti en votre nom."
            explication={
              trous.length > 0
                ? 'Les candidatures signalées ci-dessus n’ont pas laissé de preuve — c’est différent de « rien n’est parti ».'
                : 'Dès qu’une candidature partira, sa preuve exacte apparaîtra ici.'
            }
            // Le composant EXIGE une action, et il a raison : un état vide qui
            // ne dit pas quoi faire laisse quelqu'un devant une page blanche en
            // se demandant si le produit est cassé.
            action={{ libelle: 'Voir les offres retenues', href: '/opportunites' }}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
            {lignes.map((r) => (
              <li key={r.id} style={{ borderTop: '1px solid var(--trait)', paddingTop: 'var(--space-3)' }}>
                <Link href={`/recus/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ display: 'block', fontSize: '15px' }}>
                    {r.opportunites?.offres.titre ?? 'Offre supprimée'}
                    {r.opportunites !== null ? (
                      <span style={{ color: 'var(--texte-secondaire)' }}>
                        {' — '}
                        {r.opportunites.offres.employeur_affiche}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{ display: 'block', fontSize: '13px', color: 'var(--texte-secondaire)' }}
                  >
                    <time dateTime={r.envoye_le}>{DATE.format(new Date(r.envoye_le))}</time>
                    {` · ${CANAL[r.canal] ?? r.canal} · ${RESULTAT[r.resultat] ?? r.resultat}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Module>
    </main>
  )
}
