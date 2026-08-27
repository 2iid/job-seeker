'use client'

/**
 * JOB-048 · US-05 — « approbation en ≤ 10 s à une main ».
 *
 * Cette contrainte décide de tout l'écran :
 *
 * · **Approuver est UN geste.** Un bouton, pleine largeur, en bas — là où le
 *   pouce arrive à 390 px. Pas de confirmation : ce qui part a déjà été relu
 *   sur l'écran de différence, et redemander « êtes-vous sûr ? » ferait
 *   relire une seconde fois ce qu'on vient de lire.
 *
 * · **Refuser est un geste ET un motif.** Le motif n'est pas une formalité
 *   administrative : REQ-006 en dépend. Un refus sans motif écarte une offre ;
 *   un refus avec motif corrige la recherche. Les motifs sont donc des boutons
 *   — pas une liste déroulante, qui demanderait trois gestes.
 *
 * · **Au clavier : A pour approuver, R pour refuser.** Sur poste fixe, la file
 *   se traite sans quitter le clavier. Les touches sont ignorées dans un champ
 *   de saisie — envoyer une candidature parce que quelqu'un tapait « a » dans
 *   sa note serait le pire défaut possible de cet écran.
 */

import { useActionState, useEffect, useState } from 'react'
import { Bouton, Score, type PreuveAffichee } from '@job-seeker/ui'
import { creerTraducteur } from '@job-seeker/i18n'
import { LIBELLE_MOTIF, MOTIFS } from '@job-seeker/profil'
import { approuver, refuser, type Retour } from './actions'

const t = creerTraducteur('fr')

export type Proposition = {
  readonly id: string
  readonly titre: string
  readonly employeur: string
  readonly score: number | null
  readonly correspondances: readonly PreuveAffichee[]
  readonly manques: readonly PreuveAffichee[]
  readonly citationsRejetees: number
  readonly expireLe: string | null
}

export function Element({ p, sur, rang }: { p: Proposition; sur: number; rang: number }) {
  const [retourA, actionA] = useActionState(approuver, null as Retour)
  const [retourR, actionR] = useActionState(refuser, null as Retour)
  const [motifOuvert, setMotifOuvert] = useState(false)

  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      const c = e.target as HTMLElement | null
      if (c !== null && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(c.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault()
        document.getElementById(`approuver-${p.id}`)?.click()
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        setMotifOuvert(true)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [p.id])

  const echu = p.expireLe !== null && new Date(p.expireLe).getTime() <= Date.now()

  return (
    <article
      aria-label={`${p.titre} — ${p.employeur}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-5)',
        background: 'var(--surface-module)',
        borderRadius: 'var(--radius-module)',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
          {rang} / {sur}
        </span>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-attente)', fontWeight: 600 }}>
          ◆ {t('approbation.titre')}
        </p>
        <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 600, letterSpacing: '-0.012em' }}>{p.titre}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>{p.employeur}</p>
      </header>

      {p.score !== null && (
        <Score
          valeur={p.score}
          correspondances={p.correspondances}
          manques={p.manques}
          bloquants={[]}
          citationsRejetees={p.citationsRejetees}
          t={t}
        />
      )}

      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
        {t('approbation.rien-parti')}
      </p>

      {echo(retourA) ?? echo(retourR)}

      {motifOuvert ? (
        <form action={actionR} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input type="hidden" name="id" value={p.id} />
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Pourquoi pas celle-ci ?</p>
          {/* Des boutons, pas une liste déroulante : celle-ci demanderait trois
              gestes là où US-05 en accorde peu. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {MOTIFS.map((m) => (
              <button
                key={m}
                type="submit"
                name="motif"
                value={m}
                style={{
                  minHeight: '44px', // G3
                  padding: '0 var(--space-3)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-page)',
                  border: '1px solid var(--border-control)',
                  borderRadius: 'var(--radius-control)',
                  cursor: 'pointer',
                }}
              >
                {LIBELLE_MOTIF[m]}
              </button>
            ))}
          </div>
          <label htmlFor={`note-${p.id}`} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Précision — facultative
          </label>
          <input
            id={`note-${p.id}`}
            name="note"
            style={{
              minHeight: '44px',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: '15px',
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
              background: 'var(--surface-page)',
              border: '1px solid var(--border-control)',
              borderRadius: 'var(--radius-control)',
            }}
          />
          <Bouton onClick={() => setMotifOuvert(false)}>Annuler</Bouton>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <form action={actionA} style={{ display: 'contents' }}>
            <input type="hidden" name="id" value={p.id} />
            <button
              id={`approuver-${p.id}`}
              type="submit"
              disabled={echu}
              style={{
                flex: '1 1 200px',
                minHeight: '52px', // plus haut que la cible minimale : c'est LE geste
                fontSize: '16px',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: 'var(--text-on-fill)',
                background: echu ? 'var(--border-control)' : 'var(--accent-attente)',
                border: 'none',
                borderRadius: 'var(--radius-control)',
                cursor: echu ? 'not-allowed' : 'pointer',
              }}
            >
              {echu ? 'Offre expirée' : 'Envoyer'} <kbd style={{ fontSize: '11px', opacity: 0.8 }}>A</kbd>
            </button>
          </form>
          <Bouton onClick={() => setMotifOuvert(true)}>
            Ne pas envoyer <kbd style={{ fontSize: '11px' }}>R</kbd>
          </Bouton>
          <a href={`/opportunites/${p.id}/document`} style={{ textDecoration: 'none' }}>
            <Bouton>Relire le document</Bouton>
          </a>
        </div>
      )}
    </article>
  )
}

function echo(r: Retour) {
  if (r === null) return null
  return (
    <p
      role="status"
      style={{ margin: 0, fontSize: '13px', color: r.ok ? 'var(--text-secondary)' : 'var(--accent-critique)' }}
    >
      {r.ok ? '✓ Enregistré.' : `▲ ${r.message}`}
    </p>
  )
}
