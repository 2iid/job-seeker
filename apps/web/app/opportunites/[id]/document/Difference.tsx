'use client'

/**
 * JOB-041 — la vue de différence, modification par modification.
 *
 * Trois règles de présentation, et chacune a une raison qui n'est pas
 * esthétique :
 *
 * · **G5 : ce qui est ajouté et ce qui est retiré ne se distinguent pas par la
 *   couleur.** Le retiré est barré, l'ajouté est souligné. Une différence
 *   lisible uniquement en couleur est illisible en niveaux de gris, au soleil,
 *   et pour une partie des gens — sur un écran dont le seul rôle est de faire
 *   RELIRE, c'est disqualifiant.
 *
 * · **Le bouton dit « Je ne dirai pas ça », pas « Refuser ».** « Refuser » est
 *   le vocabulaire d'un formulaire. Ce qui se joue ici est : est-ce que je
 *   tiendrai cette phrase en entretien ? Le libellé doit poser cette
 *   question-là.
 *
 * · **Un refus n'a pas de bouton « annuler ».** REQ-007 dit « définitif pour
 *   cette candidature ». Offrir de revenir dessus transformerait une décision
 *   en une préférence qu'on repose à chaque écran.
 */

import { useActionState, useState } from 'react'
import { Bouton } from '@job-seeker/ui'
import type { DifferenceChamp } from '@job-seeker/documents'
import { refuserModification, type Retour } from './actions'

export function Difference({
  opportuniteId, differences, refusees,
}: {
  opportuniteId: string
  differences: readonly DifferenceChamp[]
  refusees: readonly string[]
}) {
  const [dejaRefusees, setRefusees] = useState<ReadonlySet<string>>(new Set(refusees))
  const [retour, action] = useActionState(refuserModification, null as Retour)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {differences.map((d) => (
        <section key={d.champ}>
          <h3 style={{ margin: '0 0 var(--space-3)', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {d.champ}
          </h3>

          <p
            style={{
              margin: '0 0 var(--space-3)',
              padding: 'var(--space-3)',
              fontSize: '15px',
              lineHeight: 1.6,
              background: 'var(--surface-module)',
              borderRadius: 'var(--radius-control)',
            }}
          >
            {d.segments.map((s, i) =>
              s.type === 'garde' ? (
                <span key={i}>{s.texte}</span>
              ) : s.type === 'retire' ? (
                // Barré : lisible sans couleur, y compris en niveaux de gris.
                <del key={i} style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                  {s.texte}
                </del>
              ) : (
                <ins key={i} style={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                  {s.texte}
                </ins>
              ),
            )}
          </p>

          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {d.modifications.map((m) => {
              const clef = `${d.champ}:${m.id}`
              const refusee = dejaRefusees.has(clef)
              return (
                <li
                  key={m.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    minHeight: '52px', // G3
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--border-control)',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  <span style={{ fontSize: '14px', flex: '1 1 240px' }}>
                    {m.retire !== '' && (
                      <del style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                        {m.retire.trim()}
                      </del>
                    )}
                    {m.retire !== '' && m.ajoute !== '' && ' → '}
                    {m.ajoute !== '' && <ins style={{ textDecoration: 'underline' }}>{m.ajoute.trim()}</ins>}
                  </span>

                  {refusee ? (
                    // Pas de bouton pour revenir dessus : « définitif ».
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <span aria-hidden="true">■ </span>écarté — votre texte est conservé
                    </span>
                  ) : (
                    <form
                      action={action}
                      onSubmit={() => setRefusees((s) => new Set([...s, clef]))}
                    >
                      <input type="hidden" name="opportuniteId" value={opportuniteId} />
                      <input type="hidden" name="cle" value={clef} />
                      <Bouton type="submit">Je ne dirai pas ça</Bouton>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {retour !== null && !retour.ok && (
        <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--accent-critique)' }}>
          ▲ {retour.message}
        </p>
      )}
    </div>
  )
}
