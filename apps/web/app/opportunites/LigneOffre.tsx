/**
 * JOB-038 — une entrée du flux.
 *
 * Le système impose que sous 768 px un tableau devienne une **liste de lignes
 * de 52 px** avec deux valeurs visibles et le reste au dépliage. Cette ligne
 * est cette liste : elle n'est pas un tableau rétréci, parce qu'un tableau de
 * 1280 réduit à 390 n'est pas responsive, c'est un tableau illisible.
 *
 * Les deux valeurs visibles sont le TITRE et la FRAÎCHEUR. Pas le score : un
 * nombre lu en premier devient le critère de tri du regard, et un score est
 * précisément ce qui doit être ouvert pour valoir quelque chose.
 */

import Link from 'next/link'
import { Fraicheur, formaterSalaire, type MontantAffichable, type Taux } from '@job-seeker/ui'
import type { Traducteur } from '@job-seeker/i18n'
import type { TierName } from '@job-seeker/ui'

export type EntreeFlux = {
  readonly id: string
  readonly titre: string
  readonly employeur: string
  readonly palier: TierName
  /** Minutes depuis notre relevé — jamais depuis la date que la source affirme. */
  readonly minutesDepuisReleve: number | null
  readonly score: number | null
  readonly bloquants: number
  readonly salaire: MontantAffichable | null
  readonly lieu: string | null
  readonly source: string
}

export function LigneOffre({ e, t, taux }: { e: EntreeFlux; t: Traducteur; taux: Taux | null }) {
  const salaire = e.salaire === null ? null : formaterSalaire(e.salaire, { taux })
  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        minHeight: '52px', // G3 : ligne tactile
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--border-control)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Link
          href={`/opportunites/${e.id}`}
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textDecoration: 'none',
            // La cible du lien couvre la ligne : à 390 px, viser un titre de
            // 15 px avec un pouce est un exercice qu'on rate.
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '44px',
          }}
        >
          {e.titre}
        </Link>
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{e.employeur}</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
        {/* La fraîcheur AVEC son palier, toujours — c'est la seule promesse du
            produit, et elle ne se surestime pas. */}
        <Fraicheur palier={e.palier} minutes={e.minutesDepuisReleve} t={t} />

        {e.score !== null && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {t('score.titre', { valeur: e.score })}
          </span>
        )}

        {e.bloquants > 0 && (
          // G5 : la forme ET le mot. Un liseré orange seul ne dit rien à qui
          // ne le distingue pas du gris.
          <span style={{ color: 'var(--accent-attente)', fontWeight: 600 }}>
            <span aria-hidden="true">■ </span>
            {t('score.bloquants')}
          </span>
        )}

        {e.lieu !== null && <span style={{ color: 'var(--text-muted)' }}>{e.lieu}</span>}
      </div>

      {salaire !== null && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '13px' }}>
          {/* La devise de l'offre d'abord : c'est le nombre qui figurera au
              contrat. Notre traduction vient après, et se dit comme telle. */}
          <span>{salaire.origine}</span>
          {salaire.converti !== null && (
            <span style={{ color: 'var(--text-muted)' }}>
              {salaire.converti} <span style={{ fontSize: '12px' }}>({salaire.mentionTaux})</span>
            </span>
          )}
        </div>
      )}
    </li>
  )
}
