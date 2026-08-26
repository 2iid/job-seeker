import type { ReactNode } from 'react'
import { Bouton } from './primitives'

/**
 * JOB-013 — les quatre états de tout composant de données.
 *
 * Le système est catégorique : *« l'état vide est l'écran qu'un nouvel
 * utilisateur voit en premier — c'est de l'onboarding, pas un texte gris »*, et
 * *« l'erreur dit ce qui a échoué, depuis quand, et ce que ça n'implique pas »*.
 *
 * Ces contraintes sont dans les TYPES, pas dans une consigne : on ne peut pas
 * construire un état vide sans action, ni une erreur sans dire ce qu'elle
 * n'implique pas. Une règle qu'on peut oublier est une règle qu'on oubliera.
 */

/**
 * Chargement — le squelette a la FORME du contenu à venir, jamais une roue qui
 * tourne : une roue ne dit ni combien, ni quoi.
 */
export function Squelette({ lignes = 3, hauteurLigne = 52, libelle }: {
  lignes?: number
  hauteurLigne?: number
  /** Ce qu'on est en train de faire. Sous mouvement réduit, c'est la SEULE information d'activité. */
  libelle: string
}) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{
        fontFamily: 'ui-monospace, monospace', fontSize: '10.5px', letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-3)',
      }}>
        {libelle}
      </span>
      {Array.from({ length: lignes }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            height: `${hauteurLigne}px`,
            // Dégressif : le squelette imite la vraie densité d'une liste.
            width: `${100 - i * 7}%`,
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--rule-inner)',
          }}
        />
      ))}
    </div>
  )
}

/** Vide — porte une ACTION. Le type l'exige : `action` n'est pas optionnel. */
export function Vide({ titre, explication, action }: {
  titre: string
  explication: string
  action: { libelle: string; onClick?: () => void; href?: string }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'flex-start', padding: 'var(--space-5) 0' }}>
      <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, color: 'var(--text-primary)' }}>{titre}</p>
      <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text-secondary)', maxWidth: '46ch' }}>
        {explication}
      </p>
      {action.href === undefined
        ? <Bouton ton="machine" pleine onClick={action.onClick}>{action.libelle}</Bouton>
        : <a href={action.href} style={{ textDecoration: 'none' }}><Bouton ton="machine" pleine>{action.libelle}</Bouton></a>}
    </div>
  )
}

/**
 * Erreur — trois informations obligatoires, aucune facultative.
 *
 * `ceQueCaNImpliquePas` est le champ qui fait la différence entre une erreur
 * utile et une erreur anxiogène : sur ce produit, une source muette ne veut PAS
 * dire qu'il n'y a pas d'offres, et l'écran doit le dire lui-même.
 */
export function Erreur({ quoi, depuis, ceQueCaNImpliquePas, action }: {
  quoi: string
  depuis: string
  ceQueCaNImpliquePas: string
  action?: { libelle: string; onClick?: () => void }
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
        padding: 'var(--space-4)', border: '1px solid var(--accent-attente)',
        background: 'var(--surface-module)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 2.1L12.4 11.7H1.6z" stroke="var(--accent-attente)" strokeWidth="1.3" />
          <path d="M7 5.8v2.6M7 10.1v.1" stroke="var(--accent-attente)" strokeWidth="1.4" />
        </svg>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-attente)' }}>{quoi}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', color: 'var(--text-muted)' }}>
          {depuis}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        {ceQueCaNImpliquePas}
      </p>
      {action === undefined ? null : <Bouton onClick={action.onClick}>{action.libelle}</Bouton>}
    </div>
  )
}

/** Trop de données — ce qui est montré, ce qui est écarté, et pourquoi. Jamais caché. */
export function TropDeDonnees({ total, montres, critere, action, children }: {
  total: number
  montres: number
  critere: string
  action: { libelle: string; onClick?: () => void }
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--accent-machine)' }}>{total}</strong>
        {' '}au total. Je montre les{' '}
        <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{montres}</strong>
        {' '}{critere}. Le reste est consultable, pas caché.
      </p>
      {children}
      <Bouton onClick={action.onClick}>{action.libelle}</Bouton>
    </div>
  )
}
