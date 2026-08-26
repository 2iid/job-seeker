/**
 * JOB-016 — la ligne de vie de l'agent.
 *
 * REQ-013 : la personne doit pouvoir dire, à tout moment, ce que l'agent a
 * fait en son nom. Ce composant est la réponse à « qu'est-ce qui s'est passé
 * pendant que je ne regardais pas ? ».
 *
 * Deux règles qui décident de sa forme :
 *
 * · **Le silence est une information, pas un vide.** Un agent qui n'a rien
 *   fait depuis six heures n'est pas en panne : le marché est calme. Un écran
 *   vide laisse conclure le contraire, et REQ-003 interdit exactement ça —
 *   une absence de résultat ne se présente jamais comme une absence tout court.
 *
 * · **Chaque entrée porte son heure ET sa forme.** Le statut n'est jamais
 *   porté par la couleur seule (G5), et l'ordre est chronologique inverse :
 *   ce qui vient de se passer est ce qu'on cherche.
 */

import type { Traducteur } from '@job-seeker/i18n'
import { STATUSES, type StatusName } from '../status'
import { Forme } from './forme'

export type Evenement = {
  readonly id: string
  readonly statut: StatusName
  readonly quoi: string
  /** Déjà formatée par l'appelant, qui seul connaît le fuseau de la personne. */
  readonly quand: string
}

export type EtatAgent = 'en-veille' | 'au-travail' | 'arrete'

const CLE_ETAT: Record<EtatAgent, 'agent.en-veille' | 'agent.au-travail' | 'agent.arrete'> = {
  'en-veille': 'agent.en-veille',
  'au-travail': 'agent.au-travail',
  arrete: 'agent.arrete',
}

export function LigneDeVie({
  evenements, etat, depuis, t,
}: {
  evenements: readonly Evenement[]
  etat: EtatAgent
  /** Depuis quand rien ne s'est passé — sert au message de silence. */
  depuis: string
  t: Traducteur
}) {
  return (
    <section aria-labelledby="ligne-de-vie-titre" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h2 id="ligne-de-vie-titre" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
          {t('agent.ligne-de-vie')}
        </h2>
        <span
          style={{
            fontSize: '13px',
            color: etat === 'arrete' ? 'var(--accent-attente)' : 'var(--text-secondary)',
          }}
        >
          {/* La forme précède le mot, y compris pour l'état de l'agent : c'est
              l'information la plus consultée de l'écran. */}
          <span aria-hidden="true">{etat === 'arrete' ? '■ ' : etat === 'au-travail' ? '▶ ' : '○ '}</span>
          {t(CLE_ETAT[etat])}
        </span>
      </header>

      {evenements.length === 0 ? (
        // Un vide qui EXPLIQUE. « Rien depuis 6 h » seul se lit « c'est
        // cassé » ; la deuxième phrase est ce qui empêche cette lecture.
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          {t('agent.rien-a-montrer', { age: depuis })}
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {evenements.map((e) => {
            const s = STATUSES[e.statut]
            return (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  minHeight: '52px', // G3 : ligne tactile
                  padding: 'var(--space-2) 0',
                  borderBottom: '1px solid var(--border-control)',
                }}
              >
                <span style={{ color: `var(--${s.tone})`, paddingTop: '3px' }}>
                  <Forme shape={s.shape} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px' }}>{e.quoi}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t(s.labelKey)} · {e.quand}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
