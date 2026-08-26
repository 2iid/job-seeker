/**
 * JOB-033 — ce qui manque, et ce que ça empêche.
 *
 * Ce bloc ne barre la route à personne. REQ-002 : « le profil reste utilisable
 * tant que les critères sont incomplets ». Un formulaire qui refuse d'avancer
 * n'est pas une garantie de qualité, c'est une porte fermée — et quelqu'un qui
 * commence un profil de recherche d'emploi n'a pas toutes les réponses le
 * premier jour.
 *
 * Chaque ligne dit ce que le manque EMPÊCHE. « Il manque votre autorisation de
 * travail » n'apprend rien : le champ est vide, on le voit. La conséquence est
 * ce qui transforme une réprimande en raison.
 */

import type { Completude, Portee } from '@job-seeker/profil'

// G5 : forme ET libellé. Un lecteur en niveaux de gris, ou qui ne distingue pas
// l'orange, doit lire exactement la même information.
const FORME: Record<Portee, { signe: string; libelle: string; couleur: string }> = {
  automatisation: { signe: '■', libelle: 'bloque l’automatisation', couleur: 'var(--accent-attente)' },
  veille: { signe: '▲', libelle: 'bloque la recherche', couleur: 'var(--accent-critique)' },
  qualite: { signe: '○', libelle: 'à améliorer', couleur: 'var(--text-muted)' },
}

export function CeQuiManque({ completude, resume }: { completude: Completude; resume: string }) {
  if (completude.manques.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--space-4)',
          fontSize: '14px',
          background: 'var(--surface-module)',
          borderRadius: 'var(--radius-module)',
        }}
      >
        {resume}
      </div>
    )
  }

  return (
    <section
      aria-labelledby="manques-titre"
      style={{
        padding: 'var(--space-4)',
        background: 'var(--surface-module)',
        borderRadius: 'var(--radius-module)',
      }}
    >
      <h2 id="manques-titre" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
        {resume}
      </h2>
      <ul style={{ margin: 'var(--space-4) 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {completude.manques.map((m) => {
          const f = FORME[m.portee]
          return (
            <li key={m.cle} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{ color: f.couleur, fontSize: '12px', lineHeight: '20px' }}>
                {f.signe}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '14px', fontWeight: 600 }}>{m.quoi}</strong>
                  <span style={{ fontSize: '12px', color: f.couleur, fontWeight: 600 }}>{f.libelle}</span>
                </div>
                <p style={{ margin: 'var(--space-1) 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {m.empeche}
                </p>
                <a
                  href={m.ou}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: '44px', // G3
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  Compléter →
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
