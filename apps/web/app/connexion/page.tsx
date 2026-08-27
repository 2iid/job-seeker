import { destinationSure } from '@job-seeker/auth'

export const metadata = { title: 'Connexion — Cabine' }

/**
 * Un message par motif. Celui de la limitation dit d'attendre sans dire
 * POURQUOI on a été limité : nommer la portée (« pour cette adresse » plutôt
 * que « depuis cette machine ») rendrait l'écran de connexion capable de
 * répondre à « est-ce que cette personne a un compte ici ? ».
 */
const MESSAGES_ERREUR: Record<string, string> = {
  adresse: 'Cette adresse ne ressemble pas à une adresse électronique.',
  'trop-de-demandes': 'Trop de demandes. Attendez quelques minutes avant de réessayer.',
  lien: 'Ce lien n’est plus valable. Demandez-en un nouveau — ils expirent vite, c’est voulu.',
}

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erreur?: string; envoye?: string }>
}) {
  const params = await searchParams
  // La destination est assainie ICI aussi, pas seulement au retour : elle est
  // sur le point d'être écrite dans un champ de formulaire, donc dans du HTML.
  const destination = destinationSure(params.next)

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--space-4)' }}>
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--surface-module)',
          border: '1px solid var(--border-module)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: '10.5px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Cabine
        </span>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Entrer dans la cabine
        </h1>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Je vous envoie un lien. Pas de mot de passe à retenir, et rien à réinitialiser un jour.
        </p>

        {params.envoye !== undefined ? (
          <p
            role="status"
            style={{
              margin: 0,
              fontSize: '13px',
              lineHeight: 1.45,
              color: 'var(--accent-machine)',
              border: '1px solid var(--accent-machine)',
              padding: 'var(--space-3)',
            }}
          >
            Si cette adresse a un compte, le lien est parti. Regardez votre boîte.
          </p>
        ) : null}

        {params.erreur !== undefined ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: '13px',
              lineHeight: 1.45,
              color: 'var(--accent-critique)',
              border: '1px solid var(--accent-critique)',
              padding: 'var(--space-3)',
            }}
          >
            {MESSAGES_ERREUR[params.erreur] ?? MESSAGES_ERREUR.lien}
          </p>
        ) : null}

        <form action="/auth/lien" method="post" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input type="hidden" name="next" value={destination} />
          <label htmlFor="email" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Votre adresse
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.fr"
            style={{
              height: 'var(--touch-min)',
              padding: '0 var(--space-3)',
              fontSize: '15px',
              color: 'var(--text-primary)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-control)',
              borderRadius: 'var(--radius-control)',
            }}
          />
          <button
            type="submit"
            style={{
              height: 'var(--touch-min)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-on-fill)',
              background: 'var(--accent-machine)',
              border: 'none',
              borderRadius: 'var(--radius-control)',
              cursor: 'pointer',
            }}
          >
            M’envoyer le lien
          </button>
        </form>

        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          Rien ne part en votre nom tant que vous ne l’avez pas décidé.
        </p>
      </div>
    </main>
  )
}
