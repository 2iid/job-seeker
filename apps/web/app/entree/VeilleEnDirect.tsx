'use client'

/**
 * JOB-081 · US-15 — le moment où le produit se prouve.
 *
 * « Le point culminant n'est pas un bouton "Terminer" : c'est l'agent qui
 * trouve une offre EN DIRECT, sous les yeux de l'utilisateur, avant qu'on lui
 * ait demandé de faire confiance. »
 *
 * Trois choses que cet écran ne fera jamais :
 *
 * · **Inventer une offre.** Pas d'exemple, pas de démonstration, pas de
 *   « voici à quoi ça ressemblera ». Une trouvaille fabriquée au premier écran
 *   vend exactement la confiance que le produit promet de mériter.
 *
 * · **Prétendre chercher plus longtemps qu'il ne cherche.** Au bout du délai,
 *   il dit ce qui est en cours et ce qui suivra. Un compteur qui tourne
 *   indéfiniment fait passer une absence pour un effort.
 *
 * · **Faire de l'absence un échec.** Ne rien trouver en trente secondes est
 *   normal — les sources sont relevées toutes les 2 à 60 minutes selon leur
 *   palier. L'écran le dit, parce que REQ-003 interdit qu'une absence de
 *   résultat se présente comme autre chose que ce qu'elle est.
 */

import { useEffect, useState } from 'react'
import { Bouton, Fraicheur, Squelette } from '@job-seeker/ui'
import { creerTraducteur } from '@job-seeker/i18n'
import { terminerParcours, veilleEnDirect, type Trouvaille } from './actions'

/** Trente secondes : assez pour qu'un palier A remonte, pas assez pour lasser. */
const DELAI_MS = 30_000
const CADENCE_MS = 2_500

const t = creerTraducteur('fr')

export function VeilleEnDirect() {
  const [trouvailles, setTrouvailles] = useState<readonly Trouvaille[]>([])
  const [sources, setSources] = useState(0)
  const [ecoule, setEcoule] = useState(0)

  useEffect(() => {
    let vivant = true
    const debut = Date.now()

    const battre = async () => {
      const r = await veilleEnDirect()
      if (!vivant) return
      setTrouvailles(r.trouvailles)
      setSources(r.sourcesInterrogees)
      setEcoule(Date.now() - debut)
      // On s'arrête dès qu'on a trouvé : continuer à interroger après la
      // réponse ne sert qu'à faire tourner une animation.
      if (r.trouvailles.length === 0 && Date.now() - debut < DELAI_MS) {
        setTimeout(() => { void battre() }, CADENCE_MS)
      }
    }
    void battre()
    return () => { vivant = false }
  }, [])

  const fini = ecoule >= DELAI_MS
  const rienEncore = trouvailles.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, letterSpacing: '-0.015em' }}>
        {rienEncore ? 'Je cherche.' : 'Voilà ce que je viens de trouver.'}
      </h2>

      {rienEncore ? (
        fini ? (
          // Ce que l'écran dit quand il n'a rien : ce qui est EN COURS et ce
          // qui SUIVRA. Jamais « aucune offre » — les sources n'ont pas encore
          // toutes été relevées, et c'est une information, pas un échec.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: '15px' }}>
              Rien n’est encore remonté. Ce n’est pas une absence d’offres : je relève les boards
              d’entreprise toutes les 2 à 5 minutes et les agrégateurs toutes les 15 à 60 minutes,
              et je viens à peine de commencer pour vous.
            </p>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              Je continue en arrière-plan. Vous n’avez rien à rafraîchir — les offres apparaîtront
              dans votre flux au fur et à mesure.
            </p>
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
              {sources > 0
                ? `${sources} offre${sources > 1 ? 's' : ''} déjà relevée${sources > 1 ? 's' : ''} — je vérifie lesquelles vous correspondent.`
                : 'J’interroge les sources de votre secteur.'}
            </p>
            {/* Le squelette a la forme des lignes à venir, pas un rondel qui
                tourne : G4 interdit qu'une information soit portée par le seul
                mouvement, et un mouvement qui n'informe pas ne sert à rien. */}
            <Squelette lignes={2} libelle="Recherche en cours" />
          </>
        )
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {trouvailles.map((o) => (
            <li
              key={o.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                padding: 'var(--space-4)',
                background: 'var(--surface-module)',
                borderRadius: 'var(--radius-module)',
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 600 }}>{o.titre}</span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{o.employeur}</span>
              <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
                <Fraicheur palier={o.palier} minutes={o.minutesDepuisReleve} t={t} />
                {o.score !== null && (
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {t('score.titre', { valeur: o.score })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={terminerParcours}>
        <Bouton type="submit" ton="machine" pleine>
          {rienEncore ? 'Voir mon flux' : 'Terminer et voir mon flux'}
        </Bouton>
      </form>
    </div>
  )
}
