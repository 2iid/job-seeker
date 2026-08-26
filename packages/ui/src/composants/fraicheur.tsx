/**
 * JOB-017 — la fraîcheur : le palier AVEC l'âge, toujours.
 *
 * Trois interdits, et chacun ferme une façon de mentir :
 *
 * · **Aucun rang chiffré.** « 3ᵉ candidat » est une information que nous
 *   n'avons pas. Un produit qui la fabrique gagne de la confiance sur une
 *   chose fausse, et la perd entièrement le jour où quelqu'un s'en aperçoit.
 *
 * · **Aucune alarme.** Pas de compte à rebours, pas de rouge, pas de
 *   clignotement. L'histogramme DÉCROÎT avec l'âge : c'est une mesure, pas une
 *   urgence. Une offre de quatre heures n'est pas un problème à régler.
 *
 * · **Le palier ne se sépare jamais de l'âge.** « il y a 4 min » sans son
 *   palier laisse croire que l'offre a été publiée il y a quatre minutes. Sur
 *   le palier B, c'est faux : on sait quand on l'a VUE, pas quand elle est
 *   parue. Les deux mots ensemble, ou aucun.
 */

import type { Cle, Traducteur } from '@job-seeker/i18n'
import { TIERS, type TierName } from '../status'

/**
 * L'âge, dit dans les mots qu'on peut tenir.
 *
 * Au-delà d'une journée, on cesse de compter les heures : la précision d'une
 * minute sur une offre de trois jours est une précision inventée.
 */
export function ageEnMots(minutes: number | null, t: Traducteur): string {
  if (minutes === null) return t('fraicheur.sans-releve')
  if (minutes < 1) return t('fraicheur.a-l-instant')
  if (minutes < 60) return t('fraicheur.minutes', { n: Math.floor(minutes) })
  if (minutes < 60 * 24) return t('fraicheur.heures', { n: Math.floor(minutes / 60) })
  return t('fraicheur.jours', { n: Math.floor(minutes / (60 * 24)) })
}

/** Quatre barres au plus. La plus ancienne en garde une : zéro se lirait « éteint ». */
export function barresAllumees(palier: TierName, minutes: number | null): number {
  const max = TIERS[palier].bars
  if (minutes === null) return 1
  const seuils = [15, 60, 60 * 6] // moins de 15 min · moins d'1 h · moins de 6 h
  const rang = seuils.filter((s) => minutes >= s).length
  return Math.max(1, max - rang)
}

export function Fraicheur({
  palier, minutes, t, avecPromesse = false,
}: {
  palier: TierName
  /** Minutes depuis le relevé. `null` = pas de relevé — palier C. */
  minutes: number | null
  t: Traducteur
  /** Affiche ce que ce palier a le droit de promettre. */
  avecPromesse?: boolean
}) {
  const tier = TIERS[palier]
  // Le palier C est le SEUL dont la promesse est une limite : « je vous
  // assiste, je ne postule pas ». Les deux autres annoncent ce qu'on fait ;
  // celui-là annonce ce qu'on ne fera pas. La masquer par défaut reviendrait à
  // taire exactement ce que REQ-003 demande de dire — et l'utilisateur
  // croirait cette plateforme couverte comme les autres.
  const montrerPromesse = avecPromesse || palier === 'c'
  const allumees = barresAllumees(palier, minutes)
  const age = ageEnMots(minutes, t)
  // Sur le palier B on ne sait pas quand l'offre a été publiée — seulement
  // quand on l'a vue. Le mot « vue » n'est pas décoratif : il est la seule
  // chose qui empêche de lire un âge de relevé comme un âge de publication.
  const libelleAge = palier === 'b' ? t('fraicheur.vue', { age }) : age

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: '13px',
        color: `var(--${tier.tone})`,
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '12px' }}>
        {Array.from({ length: tier.bars }, (_, i) => (
          <span
            key={i}
            style={{
              width: '3px',
              height: `${4 + i * 2.5}px`,
              background: i < allumees ? 'currentColor' : 'var(--border-control)',
              borderRadius: '1px',
            }}
          />
        ))}
      </span>
      <span>
        {t(tier.labelKey)} · {libelleAge}
      </span>
      {montrerPromesse && (
        <span style={{ color: 'var(--text-muted)' }}>— {t(tier.promiseKey as Cle)}</span>
      )}
    </span>
  )
}
