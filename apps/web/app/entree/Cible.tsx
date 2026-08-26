'use client'

/**
 * JOB-081 — « ce que je cherche », réduit au strict minimum.
 *
 * Un intitulé, et c'est tout ce qui est exigé. Les zones et le mode de travail
 * sont proposés parce qu'ils améliorent immédiatement le résultat, mais les
 * rendre obligatoires transformerait l'accueil en formulaire — et quelqu'un
 * qui commence une recherche d'emploi n'a pas toutes les réponses le premier
 * jour. Tout se complète ensuite dans `/criteres`, et l'écran le dit.
 */

import { useActionState, useEffect } from 'react'
import { Bouton, Module } from '@job-seeker/ui'
import { enregistrerCible, type Retour } from './actions'

const champ = {
  width: '100%',
  minHeight: '44px', // G3
  padding: 'var(--space-2) var(--space-3)',
  fontSize: '15px',
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--surface-page)',
  border: '1px solid var(--border-control)',
  borderRadius: 'var(--radius-control)',
} as const

export function Cible({ onSuivant }: { onSuivant: () => void }) {
  const [retour, action] = useActionState(enregistrerCible, null as Retour)

  // `useEffect`, et pas un appel pendant le rendu : avancer d'étape est un
  // effet, et le déclencher en rendant fait rendre deux composants à la fois.
  // La condition porte sur `ok` — on n'avance PAS quand l'enregistrement a
  // échoué, sans quoi la personne perdrait sa saisie en croyant l'avoir
  // donnée.
  useEffect(() => {
    if (retour?.ok === true) onSuivant()
  }, [retour, onSuivant])

  return (
    <Module titre="Ce que vous cherchez">
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="intitules" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Quel poste ? — un ou plusieurs, séparés par des virgules
          </label>
          <input id="intitules" name="intitules" placeholder="Chef de projet marketing" style={champ} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="zones" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Où ? — facultatif
          </label>
          <input id="zones" name="zones" placeholder="Dakar, Paris" style={champ} />
        </div>

        <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
          <legend style={{ padding: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Mode de travail — facultatif
          </legend>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            {[
              ['distanciel', 'Distanciel'],
              ['hybride', 'Hybride'],
              ['presentiel', 'Présentiel'],
            ].map(([v, l]) => (
              <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: '44px', fontSize: '15px' }}>
                <input type="checkbox" name="presence" value={v} style={{ width: '20px', height: '20px' }} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        {retour !== null && !retour.ok && (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--accent-critique)' }}>
            ▲ {retour.message}
          </p>
        )}

        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
          Salaire, secteurs, langues, exclusions : tout se complète ensuite. Un intitulé me suffit pour
          commencer.
        </p>

        <div>
          <Bouton type="submit" ton="machine" pleine>Chercher pour moi</Bouton>
        </div>
      </form>
    </Module>
  )
}
