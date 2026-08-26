'use client'

/**
 * JOB-033 — les formulaires du profil.
 *
 * Rien n'y est obligatoire au sens du navigateur : `required` ferme la porte
 * alors que REQ-002 demande de la laisser ouverte. Ce qui manque est dit par
 * `CeQuiManque`, avec sa conséquence, et la personne décide quand le combler.
 */

import { useActionState } from 'react'
import { Bouton, Module } from '@job-seeker/ui'
import { afficherDate, type DateCv } from '@job-seeker/parsing/client'
import { ajouterCompetence, enregistrerExperience, enregistrerIdentite, type Retour } from './actions'

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

function Etat({ retour }: { retour: Retour }) {
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
      {retour.ok ? '✓ Enregistré. La version précédente est conservée.' : `▲ ${retour.message}`}
    </p>
  )
}

export function Identite({ profil }: {
  profil: {
    titreAccroche: string | null
    fuseau: string
    locale: string
    autorisationTravail: readonly string[]
  }
}) {
  const [retour, action] = useActionState(enregistrerIdentite, null)
  return (
    <Module titre="Qui vous êtes">
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="titreAccroche" style={etiquette}>Votre intitulé actuel</label>
          <input id="titreAccroche" name="titreAccroche" defaultValue={profil.titreAccroche ?? ''} style={champ} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="autorisationTravail" style={etiquette}>
            Pays où vous pouvez travailler sans démarche
          </label>
          <input
            id="autorisationTravail"
            name="autorisationTravail"
            defaultValue={profil.autorisationTravail.join(', ')}
            placeholder="SN, FR, CA"
            aria-describedby="autorisation-aide"
            style={champ}
          />
          <p id="autorisation-aide" style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Codes à deux lettres, séparés par des virgules. C’est le seul critère sur lequel je refuse
            de postuler pour vous sans en être certaine.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 200px' }}>
            <label htmlFor="fuseau" style={etiquette}>Votre fuseau horaire</label>
            <input id="fuseau" name="fuseau" defaultValue={profil.fuseau} style={champ} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 160px' }}>
            <label htmlFor="locale" style={etiquette}>Langue de l’interface</label>
            <select id="locale" name="locale" defaultValue={profil.locale} style={champ}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Bouton type="submit" ton="machine" pleine>Enregistrer</Bouton>
          <Etat retour={retour} />
        </div>
      </form>
    </Module>
  )
}

export function Experience({ experience }: {
  experience: {
    id: string | null
    employeur: string
    intitule: string
    debut: DateCv | null
    fin: DateCv | null
    description: string | null
  }
}) {
  const [retour, action] = useActionState(enregistrerExperience, null)
  const nouvelle = experience.id === null
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {!nouvelle && <input type="hidden" name="id" value={experience.id ?? ''} />}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 220px' }}>
          <label style={etiquette}>Employeur</label>
          <input name="employeur" defaultValue={experience.employeur} style={champ} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 220px' }}>
          <label style={etiquette}>Intitulé du poste</label>
          <input name="intitule" defaultValue={experience.intitule} style={champ} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 160px' }}>
          <label style={etiquette}>Début</label>
          {/* La date est rendue AVEC SA PRÉCISION : « 2021 » si le CV disait
              « 2021 ». Afficher « 1 janvier 2021 » ajouterait une information
              que personne n'a donnée, et la personne la corrigerait en
              croyant corriger sa propre saisie. */}
          <input
            name="debut"
            defaultValue={experience.debut === null ? '' : afficherDate(experience.debut)}
            placeholder="2019 ou mars 2019"
            style={champ}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: '1 1 160px' }}>
          <label style={etiquette}>Fin — vide si en cours</label>
          <input
            name="fin"
            defaultValue={experience.fin === null ? '' : afficherDate(experience.fin)}
            style={champ}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label style={etiquette}>Ce que vous y faites</label>
        <textarea name="description" defaultValue={experience.description ?? ''} rows={3} style={champ} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Bouton type="submit">{nouvelle ? 'Ajouter cette expérience' : 'Enregistrer'}</Bouton>
        <Etat retour={retour} />
      </div>
    </form>
  )
}

export function Competences({ libelles }: { libelles: readonly string[] }) {
  const [retour, action] = useActionState(ajouterCompetence, null)
  return (
    <Module titre="Compétences">
      {libelles.length > 0 && (
        <ul style={{ margin: '0 0 var(--space-4)', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {libelles.map((l) => (
            <li
              key={l}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                fontSize: '13px',
                background: 'var(--surface-page)',
                border: '1px solid var(--border-control)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              {l}
            </li>
          ))}
        </ul>
      )}
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <label htmlFor="libelles" style={etiquette}>Ajouter — séparez par des virgules</label>
        <input id="libelles" name="libelles" placeholder="SQL, Looker Studio, gestion de budget" style={champ} />
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Bouton type="submit">Ajouter</Bouton>
          <Etat retour={retour} />
        </div>
      </form>
    </Module>
  )
}
