'use client'

/**
 * JOB-038 — la barre de filtres.
 *
 * Elle écrit dans l'URL et rien d'autre. Un filtre gardé dans un état de
 * composant disparaît au rechargement, ne se partage pas, et ne revient pas en
 * arrière — or un flux d'offres se consulte en allers-retours.
 *
 * Le nombre de critères posés est annoncé, et c'est important : quelqu'un qui
 * revient sur cet écran après deux jours et n'y voit rien doit pouvoir
 * comprendre en un coup d'œil que ce sont SES filtres qui masquent, et non le
 * marché qui s'est tu. C'est REQ-003 appliqué à l'interface plutôt qu'aux
 * sources.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { Bouton } from '@job-seeker/ui'
import { ecrireFiltres, PALIERS, type Filtres } from './filtres.ts'

const PALIER_LIBELLE: Record<string, string> = {
  a: 'Palier A — board de l’entreprise',
  b: 'Palier B — agrégateur',
  c: 'Palier C — assisté',
}

export function BarreFiltres({ filtres, nombre }: { filtres: Filtres; nombre: number }) {
  const router = useRouter()
  const params = useSearchParams()

  const aller = (suivant: Filtres) => router.push(`/opportunites${ecrireFiltres(suivant)}`)

  const basculerPalier = (p: 'a' | 'b' | 'c') =>
    aller({
      ...filtres,
      paliers: filtres.paliers.includes(p)
        ? filtres.paliers.filter((x) => x !== p)
        : [...filtres.paliers, p],
    })

  return (
    <section
      aria-label="Filtres"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--surface-module)',
        borderRadius: 'var(--radius-module)',
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = new FormData(e.currentTarget).get('q')
          aller({ ...filtres, recherche: String(q ?? '').trim() })
        }}
        style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}
      >
        <label htmlFor="q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Rechercher dans les intitulés
        </label>
        <input
          id="q"
          name="q"
          defaultValue={filtres.recherche}
          placeholder="Rechercher dans les intitulés"
          key={params.toString()}
          style={{
            flex: '1 1 200px',
            minHeight: '44px', // G3
            padding: 'var(--space-2) var(--space-3)',
            fontSize: '15px',
            fontFamily: 'inherit',
            color: 'var(--text-primary)',
            background: 'var(--surface-page)',
            border: '1px solid var(--border-control)',
            borderRadius: 'var(--radius-control)',
          }}
        />
        <Bouton type="submit">Rechercher</Bouton>
      </form>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {PALIERS.map((p) => {
          const actif = filtres.paliers.includes(p)
          return (
            <label
              key={p}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                minHeight: '44px', // G3
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={actif}
                onChange={() => basculerPalier(p)}
                style={{ width: '20px', height: '20px' }}
              />
              {PALIER_LIBELLE[p]}
            </label>
          )
        })}

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filtres.seulementSansBloquant}
            onChange={() => aller({ ...filtres, seulementSansBloquant: !filtres.seulementSansBloquant })}
            style={{ width: '20px', height: '20px' }}
          />
          Masquer ce que je ne peux pas envoyer seule
        </label>
      </div>

      {nombre > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Le compte, pour que « je ne vois rien » ne se lise jamais « le
              marché s'est tu » quand ce sont les filtres qui masquent. */}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {nombre} filtre{nombre > 1 ? 's' : ''} appliqué{nombre > 1 ? 's' : ''}
          </span>
          <Bouton onClick={() => router.push('/opportunites')}>Tout retirer</Bouton>
        </div>
      )}
    </section>
  )
}
