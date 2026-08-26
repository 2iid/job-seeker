'use client'

/**
 * JOB-034 — les critères, et ce qu'on ne veut jamais voir.
 *
 * Deux blocs, et leur séparation est la matière du ticket. Les CRITÈRES
 * décrivent ce qu'on cherche ; les EXCLUSIONS décrivent ce qu'on refuse de
 * voir. Une offre qui rate un critère est montrée avec son score ; une offre
 * exclue n'est jamais montrée du tout. Les mêler dans un seul écran laisserait
 * croire qu'un mot rédhibitoire est une préférence de plus.
 */

import { useActionState } from 'react'
import { Bouton, Module } from '@job-seeker/ui'
import { enregistrerCriteres, exclureEmployeur, retirerExclusion, type Retour } from './actions'

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

const etiquette = { fontSize: '13px', color: 'var(--text-secondary)' } as const

function Etat({ retour, succes }: { retour: Retour; succes: (r: Extract<Retour, { ok: true }>) => string }) {
  if (retour === null) return null
  return (
    <p
      role="status"
      style={{
        margin: 0,
        fontSize: '13px',
        color: retour.ok ? 'var(--text-secondary)' : 'var(--accent-critique)',
      }}
    >
      {retour.ok ? `✓ ${succes(retour)}` : `▲ ${retour.message}`}
    </p>
  )
}

function Ligne({ enfants }: { enfants: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>{enfants}</div>
}

export type CriteresCourants = {
  version: number | null
  intitules: string[]
  seniorite: string | null
  presence: string[]
  zones: string[]
  salaireMin: number | null
  salaireDevise: string | null
  secteurs: string[]
  langues: string[]
  motsRedhibitoires: string[]
}

const PRESENCES: { valeur: string; libelle: string }[] = [
  { valeur: 'distanciel', libelle: 'Distanciel' },
  { valeur: 'hybride', libelle: 'Hybride' },
  { valeur: 'presentiel', libelle: 'Présentiel' },
]

export function Criteres({ courants }: { courants: CriteresCourants }) {
  const [retour, action] = useActionState(enregistrerCriteres, null)
  return (
    <Module titre="Ce que vous cherchez">
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="intitules" style={etiquette}>Intitulés visés — séparez par des virgules</label>
          <input
            id="intitules"
            name="intitules"
            defaultValue={courants.intitules.join(', ')}
            placeholder="Product Manager, Chef de projet marketing"
            style={champ}
          />
        </div>

        <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
          <legend style={{ ...etiquette, padding: 0 }}>Mode de travail accepté</legend>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            {PRESENCES.map((p) => (
              <label
                key={p.valeur}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  minHeight: '44px', // G3
                  fontSize: '15px',
                }}
              >
                <input
                  type="checkbox"
                  name="presence"
                  value={p.valeur}
                  defaultChecked={courants.presence.includes(p.valeur)}
                  style={{ width: '20px', height: '20px' }}
                />
                {p.libelle}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="zones" style={etiquette}>Zones où vous pouvez être présente</label>
          <input
            id="zones"
            name="zones"
            defaultValue={courants.zones.join(', ')}
            placeholder="Dakar, Paris"
            aria-describedby="zones-aide"
            style={champ}
          />
          <p id="zones-aide" style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Utile seulement si vous acceptez l’hybride ou le présentiel. Une offre 100 % distancielle
            dans un autre pays n’est pas hors zone.
          </p>
        </div>

        <Ligne
          enfants={
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 200px' }}>
                <label htmlFor="salaireMin" style={etiquette}>Salaire annuel minimum</label>
                <input
                  id="salaireMin"
                  name="salaireMin"
                  defaultValue={
                    courants.salaireMin === null ? '' : String(Math.round(courants.salaireMin / 100))
                  }
                  placeholder="45000 ou 45k"
                  style={champ}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '0 1 120px' }}>
                <label htmlFor="salaireDevise" style={etiquette}>Devise</label>
                <input
                  id="salaireDevise"
                  name="salaireDevise"
                  defaultValue={courants.salaireDevise ?? 'EUR'}
                  style={champ}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 180px' }}>
                <label htmlFor="seniorite" style={etiquette}>Séniorité</label>
                <input id="seniorite" name="seniorite" defaultValue={courants.seniorite ?? ''} style={champ} />
              </div>
            </>
          }
        />

        <Ligne
          enfants={
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 240px' }}>
                <label htmlFor="secteurs" style={etiquette}>Secteurs</label>
                <input id="secteurs" name="secteurs" defaultValue={courants.secteurs.join(', ')} style={champ} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 240px' }}>
                <label htmlFor="langues" style={etiquette}>Langues que vous parlez</label>
                <input id="langues" name="langues" defaultValue={courants.langues.join(', ')} style={champ} />
              </div>
            </>
          }
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="motsRedhibitoires" style={etiquette}>
            Mots rédhibitoires — une offre qui les contient ne vous sera pas montrée
          </label>
          <input
            id="motsRedhibitoires"
            name="motsRedhibitoires"
            defaultValue={courants.motsRedhibitoires.join(', ')}
            placeholder="astreintes de nuit, commission uniquement"
            style={champ}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Bouton type="submit" ton="machine" pleine>Enregistrer ces critères</Bouton>
          <Etat
            retour={retour}
            succes={(r) => `Version ${r.version} enregistrée. Les précédentes restent lisibles.`}
          />
        </div>
      </form>
    </Module>
  )
}

export function Exclusions({ employeurs }: { employeurs: { id: string; nom: string; motif: string | null }[] }) {
  const [ajout, actionAjout] = useActionState(exclureEmployeur, null)
  const [retrait, actionRetrait] = useActionState(retirerExclusion, null)

  return (
    <Module titre="Ce que vous ne voulez jamais voir">
      <p style={{ margin: '0 0 var(--space-4)', fontSize: '14px', color: 'var(--text-secondary)' }}>
        Une offre de ces employeurs n’est <strong style={{ fontWeight: 600 }}>ni montrée, ni évaluée,
        ni envoyée</strong>. Je ne dépense même pas de quoi la lire.
      </p>

      {employeurs.length > 0 && (
        <ul style={{ margin: '0 0 var(--space-4)', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {employeurs.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                justifyContent: 'space-between',
                minHeight: '52px', // G3 : ligne tactile
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-page)',
                border: '1px solid var(--border-control)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              <span style={{ fontSize: '14px' }}>
                {e.nom}
                {e.motif !== null && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}> — {e.motif}</span>
                )}
              </span>
              <form action={actionRetrait}>
                <input type="hidden" name="id" value={e.id} />
                <Bouton type="submit">Retirer</Bouton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={actionAjout} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Ligne
          enfants={
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 220px' }}>
                <label htmlFor="employeur" style={etiquette}>Employeur à exclure</label>
                <input id="employeur" name="employeur" style={champ} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 220px' }}>
                <label htmlFor="motif" style={etiquette}>Pourquoi — facultatif, pour vous</label>
                <input id="motif" name="motif" style={champ} />
              </div>
            </>
          }
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Bouton type="submit">Exclure</Bouton>
          <Etat retour={ajout} succes={() => 'Exclu.'} />
          <Etat retour={retrait} succes={() => 'Retiré de la liste.'} />
        </div>
      </form>
    </Module>
  )
}
