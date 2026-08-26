'use client'

/**
 * JOB-081 — le cadran d'autonomie, présenté pendant le parcours.
 *
 * Le cran présélectionné est « proposer », jamais « agir seule ». Ce n'est pas
 * de la prudence décorative : un défaut permissif prend une confiance qu'on
 * n'a pas donnée, et la personne qui découvre le produit ne peut pas encore
 * savoir ce qu'elle accorde.
 *
 * Chaque cran affiche son SENS, pas seulement son libellé. « Proposer » ne dit
 * pas ce qui change ; « je prépare un dossier complet et je vous le soumets,
 * vous envoyez » le dit. Quelqu'un qui choisit sans comprendre ne donne pas sa
 * confiance : il la subit.
 *
 * Et la phrase qui compte est sous le cadran, pas au-dessus : pendant le
 * parcours, RIEN ne part, quel que soit le réglage. La personne peut donc
 * essayer les quatre positions sans rien risquer — c'est précisément ce qu'on
 * veut qu'elle fasse.
 */

import { useActionState, useEffect, useState } from 'react'
import { Bouton } from '@job-seeker/ui'
import { CRANS, CRAN_PAR_DEFAUT, LIBELLES, SENS, type Cran } from '@job-seeker/profil'
import { enregistrerCran, type Retour } from './actions'

export function Cadran({ initial, onSuivant }: { initial?: Cran; onSuivant: () => void }) {
  const [choisi, setChoisi] = useState<Cran>(initial ?? CRAN_PAR_DEFAUT)
  const [retour, action] = useActionState(enregistrerCran, null as Retour)

  // On n'avance que sur un enregistrement RÉUSSI. Avancer sur la soumission
  // ferait passer à l'étape suivante un cadran qui n'a pas été enregistré — et
  // la personne croirait avoir réglé son autonomie.
  useEffect(() => {
    if (retour?.ok === true) onSuivant()
  }, [retour, onSuivant])

  return (
    <form
      action={action}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <fieldset style={{ margin: 0, padding: 0, border: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <legend style={{ padding: 0, fontSize: '15px', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Jusqu’où voulez-vous que j’aille ?
        </legend>

        {CRANS.map((cran) => {
          const actif = choisi === cran
          return (
            <label
              key={cran}
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
                // G3 : la ligne entière est la cible, pas le seul rond.
                minHeight: '52px',
                padding: 'var(--space-3)',
                cursor: 'pointer',
                background: actif ? 'var(--surface-module)' : 'transparent',
                border: `1px solid ${actif ? 'var(--accent-machine)' : 'var(--border-control)'}`,
                borderRadius: 'var(--radius-control)',
              }}
            >
              <input
                type="radio"
                name="cran"
                value={cran}
                checked={actif}
                onChange={() => setChoisi(cran)}
                style={{ width: '20px', height: '20px', marginTop: '2px' }}
              />
              <span>
                <span style={{ display: 'block', fontSize: '15px', fontWeight: actif ? 600 : 400 }}>
                  {/* G5 : la forme accompagne le libellé — le cran retenu se
                      voit sans dépendre de la couleur du cadre. */}
                  {actif && <span aria-hidden="true">◆ </span>}
                  {LIBELLES.fr[cran]}
                </span>
                <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {SENS.fr[cran]}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* Sous le cadran, pas au-dessus : c'est ce qu'on lit après avoir choisi. */}
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
        Vous pouvez essayer les quatre positions : <strong style={{ fontWeight: 600 }}>rien ne part
        pendant l’installation</strong>, quel que soit le réglage. Vous pourrez en changer à tout
        moment ensuite.
      </p>

      {retour !== null && !retour.ok && (
        <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--accent-critique)' }}>
          ▲ {retour.message}
        </p>
      )}

      <div>
        <Bouton type="submit" ton="machine" pleine>Continuer</Bouton>
      </div>
    </form>
  )
}
