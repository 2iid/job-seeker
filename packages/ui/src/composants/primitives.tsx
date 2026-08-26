import type { CSSProperties, ReactNode } from 'react'
import { TOUCH } from '../tokens'

/**
 * JOB-013 — les primitives.
 *
 * Elles n'existent pas pour économiser des lignes : elles existent pour que les
 * règles G1–G6 soient tenues par CONSTRUCTION plutôt que par vigilance. Une
 * cible tactile de 44 px que chaque écran doit se rappeler d'appliquer est une
 * cible qui sera manquée au douzième écran.
 */

export type Ton = 'machine' | 'attente' | 'critique' | 'neutre'

const APLAT: Record<Ton, string> = {
  machine: 'var(--accent-machine)',
  attente: 'var(--accent-attente)',
  critique: 'var(--accent-critique)',
  neutre: 'var(--surface-raised, var(--surface-module))',
}

export function Bouton({
  children, ton = 'neutre', pleine = false, type = 'button', ...reste
}: {
  children: ReactNode
  ton?: Ton
  /** Aplat plein : réservé à l'action PRINCIPALE d'un écran. Une page qui en a trois n'en a aucune. */
  pleine?: boolean
  type?: 'button' | 'submit'
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'>) {
  const style: CSSProperties = {
    // La hauteur minimale n'est pas paramétrable : c'est la règle G3, et un
    // composant qui laisse la contourner ne sert à rien.
    minHeight: `${TOUCH.min}px`,
    minWidth: `${TOUCH.min}px`,
    padding: '0 var(--space-4)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    fontSize: '15px',
    fontWeight: pleine ? 600 : 400,
    fontFamily: 'inherit',
    color: pleine ? 'var(--text-on-fill)' : 'var(--text-primary)',
    background: pleine ? APLAT[ton] : 'transparent',
    border: pleine ? 'none' : '1px solid var(--border-control)',
    borderRadius: 'var(--radius-control)',
    cursor: 'pointer',
  }
  return <button type={type} style={style} {...reste}>{children}</button>
}

export function Module({ titre, actions, children }: {
  titre?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--surface-module)',
        border: '1px solid var(--border-module)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {titre === undefined ? null : (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-module)',
            background: 'var(--surface-chrome)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {titre}
          </h2>
          {actions}
        </header>
      )}
      <div style={{ padding: 'var(--space-4)' }}>{children}</div>
    </section>
  )
}
