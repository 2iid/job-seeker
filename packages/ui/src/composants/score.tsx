/**
 * JOB-014 — le score, et ce sur quoi il se fonde.
 *
 * « Un score sans explication atteignable » fait échouer une revue de design
 * dans ce projet. Le mot qui porte tout est ATTEIGNABLE.
 *
 * D'où un `<details>` natif plutôt qu'un état React. Un dépliage qui dépend
 * d'un script n'est pas atteignable quand le script n'a pas chargé, a échoué,
 * ou n'a pas encore été hydraté — et c'est précisément dans ces moments-là que
 * quelqu'un regarde un nombre sans savoir d'où il sort. `<details>` fonctionne
 * avant tout JavaScript, au clavier, et dans un lecteur d'écran.
 *
 * Deux autres règles :
 *
 * · **Chaque preuve CITE l'offre**, et la citation a été vérifiée en amont
 *   (`verifierCitations`). Ce composant n'affiche donc que du texte réellement
 *   présent dans l'annonce. Les citations écartées sont COMPTÉES à l'écran,
 *   pas masquées : cacher qu'un modèle a inventé deux justifications reviendrait
 *   à présenter les trois restantes comme si de rien n'était.
 *
 * · **Un score de 92 avec un rédhibitoire ne se lit pas « presque parfait ».**
 *   Les bloquants sont affichés AVANT les correspondances, parce que l'ordre
 *   de lecture est un argument.
 */

import type { Traducteur } from '@job-seeker/i18n'

export type PreuveAffichee = { readonly libelle: string; readonly citation: string }
export type BloquantAffiche = { readonly explication: string }

export function Score({
  valeur, correspondances, manques, bloquants, citationsRejetees, exclue = false, t,
}: {
  valeur: number
  correspondances: readonly PreuveAffichee[]
  manques: readonly PreuveAffichee[]
  bloquants: readonly BloquantAffiche[]
  citationsRejetees: number
  exclue?: boolean
  t: Traducteur
}) {
  // Une offre exclue n'a pas de score à montrer : la personne a demandé à ne
  // pas la voir, et lui présenter un nombre reviendrait à la lui montrer.
  if (exclue) {
    return (
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
        {t('score.exclue')}
      </p>
    )
  }

  const bloque = bloquants.length > 0
  return (
    <details style={{ fontSize: '14px' }}>
      <summary
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          minHeight: '44px', // G3
          cursor: 'pointer',
          listStyle: 'none',
        }}
      >
        <Jauge valeur={valeur} bloque={bloque} />
        <span style={{ fontWeight: 600 }}>{t('score.titre', { valeur })}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{t('score.deplier')}</span>
      </summary>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-3)' }}>
        {bloque && (
          <section>
            <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '13px', fontWeight: 600, color: 'var(--accent-attente)' }}>
              ▲ {t('score.bloquants')}
            </h4>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-secondary)' }}>
              {bloquants.map((b, i) => (
                <li key={i} style={{ padding: 'var(--space-1) 0' }}>{b.explication}</li>
              ))}
            </ul>
          </section>
        )}

        <Preuves titre={t('score.correspondances')} preuves={correspondances} signe="✓" />
        <Preuves titre={t('score.manques')} preuves={manques} signe="○" />

        {correspondances.length === 0 && manques.length === 0 && (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('score.aucune-preuve')}</p>
        )}

        {citationsRejetees > 0 && (
          // Compté, jamais caché : une explication amputée de ses inventions
          // sans le dire présenterait le reste comme s'il n'y avait rien eu.
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            {t('score.citations-rejetees', { n: citationsRejetees })}
          </p>
        )}
      </div>
    </details>
  )
}

/**
 * La jauge — une mesure, pas un feu tricolore.
 *
 * Elle n'est jamais rouge : un score bas est une information sur
 * l'adéquation, pas une faute. Le seul signal fort de ce composant est
 * l'accent d'attente, et il est réservé à ce qui empêche de postuler seule.
 */
function Jauge({ valeur, bloque }: { valeur: number; bloque: boolean }) {
  const borne = Math.max(0, Math.min(100, valeur))
  return (
    <span
      role="img"
      aria-label={`${borne} sur 100`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '46px',
        height: '6px',
        background: 'var(--border-control)',
        borderRadius: '3px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: `${borne}%`,
          background: bloque ? 'var(--accent-attente)' : 'var(--accent-machine)',
          borderRadius: '3px',
        }}
      />
    </span>
  )
}

function Preuves({ titre, preuves, signe }: {
  titre: string
  preuves: readonly PreuveAffichee[]
  signe: string
}) {
  if (preuves.length === 0) return null
  return (
    <section>
      <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '13px', fontWeight: 600 }}>{titre}</h4>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {preuves.map((p, i) => (
          <li key={i} style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{signe}</span>
            <div>
              <div>{p.libelle}</div>
              {/* La citation est du texte VÉRIFIÉ comme présent dans l'annonce.
                  C'est ce qui distingue une explication d'une affirmation. */}
              <blockquote
                style={{
                  margin: 'var(--space-1) 0 0',
                  paddingLeft: 'var(--space-3)',
                  borderLeft: '2px solid var(--border-control)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                {p.citation}
              </blockquote>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
