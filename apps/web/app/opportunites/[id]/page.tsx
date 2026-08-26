import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { creerTraducteur } from '@job-seeker/i18n'
import { Bouton, formaterSalaire, Fraicheur, Module, Score, type TierName } from '@job-seeker/ui'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Offre — Cabine' }

/**
 * JOB-039 — le détail d'une offre, et le score déplié en preuves.
 *
 * Ce que cet écran ne fait PAS, et qui décide de sa forme :
 *
 * · **Il ne recalcule rien.** Le score, ses correspondances et ses manques
 *   sont ceux qui ont été FIGÉS au moment de l'évaluation, avec la version de
 *   profil qui les a produits. Recalculer pour afficher donnerait un autre
 *   nombre, et l'explication ne correspondrait plus à la décision prise. C'est
 *   REQ-002 : expliquer *a posteriori*.
 *
 * · **Il ne réécrit pas les citations.** Chaque preuve cite l'annonce mot pour
 *   mot, et la citation a été VÉRIFIÉE avant d'être stockée. Ce qu'on affiche
 *   ici est du texte dont on sait qu'il figure dans l'offre.
 *
 * · **Il n'affiche pas une offre exclue.** La personne a demandé à ne pas la
 *   voir ; l'atteindre par son URL ne doit pas contourner cette demande.
 */

type Preuve = { libelle: string; citation: string }

type Detail = {
  id: string
  score: number | null
  statut: string
  correspondances: Preuve[]
  manques: Preuve[]
  redhibitoires: { explication: string }[]
  citations_rejetees: number
  exclue: boolean
  criteres_version: number | null
  offres: {
    titre: string
    employeur_affiche: string
    palier: TierName
    source: string
    url_candidature: string
    lieu: string | null
    pays: string | null
    teletravail_texte: string | null
    description: string | null
    publiee_le: string | null
    vue_le: string
    salaire_min_unites_mineures: string | null
    salaire_max_unites_mineures: string | null
    salaire_devise: string | null
    salaire_periode: string | null
  }
}

const preuves = (v: unknown): Preuve[] =>
  Array.isArray(v)
    ? v.flatMap((p) => {
        const o = p as Record<string, unknown>
        return typeof o?.['libelle'] === 'string' && typeof o?.['citation'] === 'string'
          ? [{ libelle: o['libelle'], citation: o['citation'] }]
          : []
      })
    : []

export default async function DetailOffre({ params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await utilisateurCourant()
  const { id } = await params
  if (utilisateur === null) redirect(`/connexion?next=%2Fopportunites%2F${encodeURIComponent(id)}`)

  const supabase = await clientServeur()
  const [oppoRes, profilRes] = await Promise.all([
    supabase
      .from('opportunites')
      .select(
        'id, score, statut, correspondances, manques, redhibitoires, citations_rejetees, exclue, ' +
          'criteres_version, offres!inner(*)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('profiles').select('locale').single(),
  ])

  // La RLS rend invisible ce qui n'est pas à nous : « introuvable » est donc
  // aussi la réponse à « pas la vôtre », et c'est la bonne. Distinguer les deux
  // dirait à un curieux que cet identifiant existe chez quelqu'un d'autre.
  const d = oppoRes.data as unknown as Detail | null
  if (d === null || d.exclue) notFound()

  const t = creerTraducteur(profilRes.data?.locale === 'en' ? 'en' : 'fr')
  const o = d.offres
  const minutes = Math.max(0, (Date.now() - new Date(o.vue_le).getTime()) / 60_000)
  const salaire =
    o.salaire_devise === null
      ? null
      : formaterSalaire(
          {
            min: o.salaire_min_unites_mineures === null ? null : Number(o.salaire_min_unites_mineures),
            max: o.salaire_max_unites_mineures === null ? null : Number(o.salaire_max_unites_mineures),
            devise: o.salaire_devise,
            periode: (o.salaire_periode as 'an' | 'mois' | 'jour' | 'heure' | null) ?? null,
          },
          { taux: null },
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
      <Link href="/opportunites" style={{ fontSize: '13px', color: 'var(--text-secondary)', minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>
        ← Toutes les opportunités
      </Link>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em' }}>{o.titre}</h1>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)' }}>
          {o.employeur_affiche}
          {o.lieu !== null && ` · ${o.lieu}`}
        </p>
        {/* La fraîcheur AVEC sa promesse : c'est ici, sur la page de décision,
            que la différence entre « parmi les premiers » et « publiée avant,
            je ne sais pas quand » change ce que quelqu'un fait. */}
        <Fraicheur palier={o.palier} minutes={minutes} t={t} avecPromesse />
      </header>

      <Module titre="Ma lecture de cette offre">
        {d.score === null ? (
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Je ne l’ai pas encore évaluée. Elle est détectée, c’est tout — et c’est déjà une
            information : elle existe et je l’ai vue.
          </p>
        ) : (
          <Score
            valeur={d.score}
            correspondances={preuves(d.correspondances)}
            manques={preuves(d.manques)}
            bloquants={Array.isArray(d.redhibitoires) ? d.redhibitoires : []}
            citationsRejetees={d.citations_rejetees}
            t={t}
          />
        )}
        {d.criteres_version !== null && (
          // Ce qui rattache l'explication à la décision. Sans ce numéro, un
          // score lu six mois plus tard ne se rapporte plus à rien.
          <p style={{ margin: 'var(--space-4) 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Évaluée selon la version {d.criteres_version} de vos critères.
          </p>
        )}
      </Module>

      {salaire !== null && (
        <Module titre="Rémunération annoncée">
          <p style={{ margin: 0, fontSize: '15px' }}>{salaire.origine}</p>
          {salaire.converti !== null && (
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              {salaire.converti} ({salaire.mentionTaux})
            </p>
          )}
        </Module>
      )}

      {o.description !== null && (
        <Module titre="L’annonce">
          {/* Du TEXTE, jamais du HTML : la description vient d'une page tierce,
              et elle a été dépouillée de son balisage à la lecture. La rendre
              comme du HTML ici annulerait ce travail. */}
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {o.description}
          </p>
        </Module>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href={o.url_candidature} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <Bouton>Voir l’annonce d’origine ↗</Bouton>
        </a>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Relevée sur {o.source}
          {o.publiee_le !== null && ` · la source annonce une publication le ${o.publiee_le.slice(0, 10)}`}
        </span>
      </div>
    </main>
  )
}
