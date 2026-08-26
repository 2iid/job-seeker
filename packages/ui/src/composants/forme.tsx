/**
 * La forme d'un statut — ce qui reste quand la couleur disparaît (G5).
 *
 * Chaque forme est dessinée, pas colorée : un lecteur en niveaux de gris, un
 * écran au soleil, ou quelqu'un qui ne distingue pas l'orange du gris lisent
 * exactement la même information. `currentColor` fait que la couleur reste
 * possible, mais jamais nécessaire.
 *
 * Le SVG est `aria-hidden` : le libellé textuel qui l'accompagne porte déjà le
 * sens pour un lecteur d'écran, et l'annoncer deux fois transformerait une
 * redondance visuelle utile en bavardage sonore.
 */

import type { StatusShape } from '../status'

const TRACES: Record<StatusShape, React.ReactNode> = {
  'cercle-creux': <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  'losange-plein': <path d="M7 1.5 12.5 7 7 12.5 1.5 7Z" fill="currentColor" />,
  triangle: <path d="M7 1.5 13 12.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  'carre-plein': <rect x="2" y="2" width="10" height="10" fill="currentColor" />,
  coche: <path d="M2 7.5 5.5 11 12 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'carre-epais-creux': <rect x="2.5" y="2.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  tiret: <rect x="1.5" y="6.2" width="11" height="1.6" fill="currentColor" />,
  croix: <path d="M3 3 11 11M11 3 3 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
}

export function Forme({ shape }: { shape: StatusShape }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      {TRACES[shape]}
    </svg>
  )
}
