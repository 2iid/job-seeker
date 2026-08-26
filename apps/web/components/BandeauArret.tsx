import { Bouton } from '@job-seeker/ui'
import { etatArret, reprendre } from '@/app/arret/actions'

/**
 * JOB-053 — ce qu'on voit quand tout est arrêté.
 *
 * Il dit trois choses, et la troisième est celle qu'on vient chercher :
 * que c'est arrêté, depuis quand, et **ce qui est parti juste avant**.
 *
 * Sans cette dernière, quelqu'un qui arrête en catastrophe reste avec la seule
 * question qui compte — « est-ce que celle-là est partie ? » — et aucune
 * réponse. Les reçus sont immuables : ils SONT la réponse, et c'est à ça
 * qu'ils servent le jour où ça compte.
 */
export async function BandeauArret() {
  const etat = await etatArret()
  if (!etat.arrete) return null

  const depuis = etat.depuis === null ? '' : new Date(etat.depuis).toLocaleString('fr-FR')

  return (
    <aside
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4) var(--space-6)',
        background: 'var(--surface-module)',
        borderBottom: '2px solid var(--accent-critique)',
      }}
    >
      <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
        <span aria-hidden="true">■ </span>
        Tout est arrêté depuis le {depuis}.
      </p>

      {etat.partiJusteAvant.length === 0 ? (
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          Rien n’était parti dans l’heure qui a précédé. Vous n’avez rien à rattraper.
        </p>
      ) : (
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          <p style={{ margin: '0 0 var(--space-2)' }}>
            {etat.partiJusteAvant.length} envoi{etat.partiJusteAvant.length > 1 ? 's' : ''} dans l’heure
            qui a précédé l’arrêt — ils sont partis, je ne peux pas les rappeler :
          </p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
            {etat.partiJusteAvant.map((r) => (
              <li key={r.id} style={{ padding: '2px 0' }}>
                {r.canal} · {new Date(r.le).toLocaleTimeString('fr-FR')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* La reprise EST un acte explicite : c'est le sens de l'asymétrie avec
          l'arrêt, qui n'en demande aucun. */}
      <form action={reprendre}>
        <Bouton type="submit">Reprendre le travail</Bouton>
      </form>
    </aside>
  )
}
