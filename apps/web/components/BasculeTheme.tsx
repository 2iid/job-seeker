'use client'

import { CLE_STOCKAGE, attributHtml, estChoixValide, libelleSuivant, resoudre, type Choix } from '@job-seeker/ui'
import { useEffect, useState } from 'react'

/**
 * La bascule de thème (JOB-012).
 *
 * Elle démarre sur « système » et ne lit le stockage qu'après le montage : le
 * thème visible, lui, a déjà été posé avant la première peinture par le script
 * du layout. Cette bascule ne fait que permettre d'en changer.
 */
export function BasculeTheme() {
  const [choix, setChoix] = useState<Choix>('systeme')

  useEffect(() => {
    const stocke = localStorage.getItem(CLE_STOCKAGE)
    if (estChoixValide(stocke)) setChoix(stocke)
  }, [])

  const { suivant, libelle } = libelleSuivant(choix)

  const basculer = () => {
    setChoix(suivant)
    try {
      localStorage.setItem(CLE_STOCKAGE, suivant)
    } catch {
      // Navigation privée : le choix ne survivra pas au rechargement, mais la
      // page continue de fonctionner. Échouer ici serait pire que d'oublier.
    }
    const sombre = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', attributHtml(resoudre(suivant, sombre)))
  }

  return (
    <button
      type="button"
      onClick={basculer}
      // Le libellé dit ce que le bouton FAIT. Un lecteur d'écran qui annonce
      // « sombre » ne dit pas si c'est l'état actuel ou la destination.
      aria-label={libelle}
      title={libelle}
      style={{
        minHeight: 'var(--touch-min)',
        minWidth: 'var(--touch-min)',
        padding: '0 var(--space-3)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        background: 'transparent',
        border: '1px solid var(--border-control)',
        borderRadius: 'var(--radius-control)',
        cursor: 'pointer',
      }}
    >
      {libelle}
    </button>
  )
}
