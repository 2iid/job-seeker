'use client'

/**
 * JOB-081 — l'enchaînement des étapes.
 *
 * Six étapes, et la dernière est le point culminant : l'agent trouve une offre
 * en direct. Pas un bouton « Terminer », pas un écran de félicitations — une
 * preuve.
 *
 * L'état vit dans ce composant plutôt que dans l'URL, et c'est le seul endroit
 * du produit où c'est le bon choix : un parcours d'entrée se fait une fois,
 * d'un trait, et pouvoir en partager l'étape 4 par un lien n'a aucun sens.
 * Ce qui est ENREGISTRÉ à chaque étape l'est en base — revenir plus tard
 * retrouve le profil, pas la position dans le parcours.
 */

import { useCallback, useState } from 'react'
import { Bouton, Module } from '@job-seeker/ui'
import type { Cran } from '@job-seeker/profil'
import { Cadran } from './Cadran'
import { Cible } from './Cible'
import { VeilleEnDirect } from './VeilleEnDirect'

type Etape = 'promesse' | 'cv' | 'cible' | 'cadran' | 'veille'

const ORDRE: Etape[] = ['promesse', 'cv', 'cible', 'cadran', 'veille']

export function Parcours({ aUnCv, cranInitial }: { aUnCv: boolean; cranInitial: Cran }) {
  const [etape, setEtape] = useState<Etape>(aUnCv ? 'cible' : 'promesse')
  // `useCallback` : les étapes déclenchent l'avance depuis un `useEffect`, et
  // une fonction recréée à chaque rendu y relancerait l'effet en boucle.
  const suivant = useCallback(
    () => setEtape((e) => ORDRE[Math.min(ORDRE.indexOf(e) + 1, ORDRE.length - 1)]!),
    [],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <Progression etape={etape} />

      {etape === 'promesse' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600, letterSpacing: '-0.018em' }}>
            Je cherche pendant que vous faites autre chose.
          </h2>
          {/* La promesse dit aussi sa LIMITE. Une promesse sans limite se lit
              comme une promesse de tout faire, et c'est celle-là qu'on ne peut
              pas tenir. */}
          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.55 }}>
            Je relève les offres à la source — les boards des entreprises elles-mêmes — toutes les
            deux à cinq minutes. Je vous explique pourquoi chacune vous correspond, en citant
            l’annonce. Et je ne postule jamais sans que vous l’ayez décidé.
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Il y a des endroits où je ne vais pas : LinkedIn, Indeed et quelques autres interdisent la
            collecte automatisée. Je vous y prépare votre dossier, vous l’envoyez.
          </p>
          {/*
            JOB-087 — ce que la mesure de JOB-076 interdit de taire.
            Trois profils sur cinq y ont obtenu ZÉRO offre pertinente, et
            les 393 offres relevées se répartissaient sur une poignée de pays.
            Annoncer une couverture mondiale tous secteurs vendrait une portée
            qu'on n'a pas — la seule chose qu'un produit d'agent autonome ne
            peut pas se permettre, puisque toute sa valeur repose sur le fait
            qu'on puisse le croire. Le dire ici coûte des inscriptions ; ne pas
            le dire coûterait la confiance de ceux qui restent.
          */}
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Et une chose que je préfère dire maintenant : aujourd’hui, mes sources couvrent surtout le
            travail <strong style={{ fontWeight: 600 }}>distanciel</strong> et les marchés
            nord-américain et européen. Si vous cherchez sur place ailleurs, je vous montrerai ce que
            je trouve, et je vous dirai quand je ne trouve rien parce que je ne regarde pas au bon
            endroit.
          </p>
          <div>
            <Bouton ton="machine" pleine onClick={suivant}>Commencer</Bouton>
          </div>
        </section>
      )}

      {etape === 'cv' && (
        <Module titre="Votre CV">
          <p style={{ margin: '0 0 var(--space-4)', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Je le lis pour vous proposer un profil. Vous relirez chaque information avant qu’elle ne
            soit enregistrée.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <a href="/profil/import" style={{ textDecoration: 'none' }}>
              <Bouton ton="machine" pleine>Importer mon CV</Bouton>
            </a>
            {/* Sauter est possible, et c'est dit. Un parcours qui ne se saute
                pas est un formulaire obligatoire déguisé en accueil. */}
            <Bouton onClick={suivant}>Plus tard — commencer sans</Bouton>
          </div>
        </Module>
      )}

      {etape === 'cible' && <Cible onSuivant={suivant} />}
      {etape === 'cadran' && <Cadran initial={cranInitial} onSuivant={suivant} />}
      {etape === 'veille' && <VeilleEnDirect />}
    </div>
  )
}

/**
 * Où l'on en est.
 *
 * Des points, pas une barre de pourcentage : « 60 % » sur un parcours de cinq
 * étapes est un chiffre qu'on invente, et il devient faux dès qu'on saute une
 * étape. Cinq points dont trois pleins ne mentent pas.
 */
function Progression({ etape }: { etape: Etape }) {
  const index = ORDRE.indexOf(etape)
  return (
    <div
      role="group"
      aria-label={`Étape ${index + 1} sur ${ORDRE.length}`}
      style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}
    >
      {ORDRE.map((e, i) => (
        <span
          key={e}
          aria-hidden="true"
          style={{
            width: i === index ? '20px' : '8px',
            height: '8px',
            borderRadius: '4px',
            background: i <= index ? 'var(--accent-machine)' : 'var(--border-control)',
          }}
        />
      ))}
      <span style={{ marginLeft: 'var(--space-2)', fontSize: '12px', color: 'var(--text-muted)' }}>
        Étape {index + 1} sur {ORDRE.length}
      </span>
    </div>
  )
}
