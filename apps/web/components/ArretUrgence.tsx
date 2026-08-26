'use client'

/**
 * JOB-053 · US-01 — l'arrêt, en un geste, depuis n'importe quel écran.
 *
 * Trois contraintes du design, et chacune écarte une solution plus facile :
 *
 * · **≤ 2 Tab.** Le bouton est le PREMIER élément focalisable du document.
 *   Quelqu'un qui veut tout arrêter au clavier ne doit pas traverser une barre
 *   de navigation pour y arriver.
 *
 * · **Aucune modale.** Une confirmation protège d'un arrêt accidentel au prix
 *   de retarder un arrêt VOULU. Les deux erreurs ne coûtent pas la même
 *   chose : un arrêt accidentel se répare en cliquant sur « reprendre » ; un
 *   envoi qu'on n'a pas pu arrêter ne se répare pas.
 *
 * · **`Maj + .`** — un raccourci qui ne collisionne avec rien dans un champ de
 *   saisie, et qui reste ignoré quand on est en train d'écrire : couper la
 *   veille parce que quelqu'un tapait « ; » dans sa lettre serait absurde.
 */

import { useEffect, useRef } from 'react'
import { arreterTout } from '@/app/arret/actions'

export function ArretUrgence({ arrete }: { arrete: boolean }) {
  const formulaire = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (arrete) return
    const surTouche = (e: KeyboardEvent): void => {
      // On ignore la frappe si elle a lieu dans un champ : couper la veille
      // parce que quelqu'un tapait dans sa lettre serait absurde.
      const cible = e.target as HTMLElement | null
      if (cible !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return
      if (cible?.isContentEditable === true) return
      if (e.shiftKey && e.key === '.') {
        e.preventDefault()
        formulaire.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [arrete])

  if (arrete) return null

  return (
    <form ref={formulaire} action={arreterTout} style={{ display: 'contents' }}>
      <button
        type="submit"
        // Le PREMIER élément focalisable du document. Aucun `tabIndex` négatif
        // ni ordre custom : c'est la position dans le DOM qui le garantit.
        style={{
          position: 'fixed',
          top: 'var(--space-3)',
          right: 'var(--space-3)',
          zIndex: 100,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minHeight: '44px', // G3
          minWidth: '44px',
          padding: '0 var(--space-4)',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: 'inherit',
          color: 'var(--text-primary)',
          background: 'var(--surface-module)',
          border: '1px solid var(--accent-critique)',
          borderRadius: 'var(--radius-control)',
          cursor: 'pointer',
        }}
      >
        {/* G5 : la forme ET le mot. Le carré plein dit « stop » sans couleur. */}
        <span aria-hidden="true">■</span>
        Tout arrêter
        <kbd
          aria-hidden="true"
          style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}
        >
          Maj .
        </kbd>
      </button>
    </form>
  )
}
