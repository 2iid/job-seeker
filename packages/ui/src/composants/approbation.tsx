/**
 * JOB-015 — la carte d'approbation.
 *
 * REQ-010 : rien ne part sans accord. Cette carte est l'endroit où cette
 * promesse se tient ou se rompt, et elle a une propriété que les autres
 * composants n'ont pas — **elle précède une action irréversible**.
 *
 * D'où trois choix :
 *
 * · **La première phrase dit ce qui n'est PAS parti.** Pas « Prêt à
 *   envoyer ! » — qui décrit l'état de la machine — mais « Rien n'est parti.
 *   Je n'envoie qu'après votre accord », qui répond à la question que la
 *   personne se pose vraiment en arrivant sur cet écran.
 *
 * · **Refuser est aussi accessible qu'envoyer.** Même taille, même hauteur,
 *   côte à côte. Un bouton de refus rétréci ou relégué en lien gris est une
 *   façon de faire pression, et une pression sur cet écran-ci ne serait pas
 *   une maladresse d'ergonomie : ce serait envoyer une candidature au nom de
 *   quelqu'un qui n'avait pas vraiment dit oui.
 *
 * · **Le composant n'envoie rien.** Il rend des `<form>` dont les actions sont
 *   fournies par l'appelant. Un composant d'interface qui saurait déclencher
 *   un envoi serait un endroit de plus où l'envoi peut partir.
 */

import type { ReactNode } from 'react'
import type { Traducteur } from '@job-seeker/i18n'
import { Bouton } from './primitives'

export function CarteApprobation({
  employeur, intitule, resume, t, envoyer, refuser, modifier, secondesAnnulation, enTete,
}: {
  employeur: string
  intitule: string
  /** Ce qui va partir, en une phrase — jamais un aperçu tronqué au hasard. */
  resume: ReactNode
  t: Traducteur
  /** L'action serveur d'envoi. Le composant ne sait pas ce qu'elle fait. */
  envoyer: string | ((f: FormData) => void | Promise<void>)
  refuser: string | ((f: FormData) => void | Promise<void>)
  modifier?: string
  /** Fenêtre d'annulation après l'envoi, si le canal en offre une. */
  secondesAnnulation?: number
  /** Emplacement pour le score, la fraîcheur, ce que l'appelant veut poser. */
  enTete?: ReactNode
}) {
  return (
    <article
      aria-label={`${intitule} — ${employeur}`}
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
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--accent-attente)', fontWeight: 600 }}>
          ◆ {t('approbation.titre')}
        </p>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, letterSpacing: '-0.01em' }}>
          {intitule}
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>{employeur}</p>
        {enTete}
      </header>

      <div style={{ fontSize: '14px' }}>{resume}</div>

      {/* La phrase que quelqu'un cherche en arrivant ici, avant les boutons —
          pas après, où elle serait lue une fois l'envoi déjà cliqué. */}
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
        {t('approbation.rien-parti')}
        {secondesAnnulation !== undefined && ` ${t('approbation.annulable', { n: secondesAnnulation })}`}
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <form action={envoyer as never} style={{ display: 'contents' }}>
          <Bouton type="submit" ton="attente" pleine>{t('approbation.envoyer')}</Bouton>
        </form>
        {/* Refuser a exactement la même hauteur et la même cible qu'envoyer.
            Un refus rétréci serait une pression, et une pression ici enverrait
            une candidature au nom de quelqu'un qui n'avait pas vraiment dit oui. */}
        <form action={refuser as never} style={{ display: 'contents' }}>
          <Bouton type="submit">{t('approbation.refuser')}</Bouton>
        </form>
        {modifier !== undefined && (
          <a href={modifier} style={{ textDecoration: 'none' }}>
            <Bouton>{t('approbation.modifier')}</Bouton>
          </a>
        )}
      </div>
    </article>
  )
}
