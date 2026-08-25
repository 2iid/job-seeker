export default function Home() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          background: 'var(--surface-module)',
          border: '1px solid var(--border-module)',
          padding: '30px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
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
          Cabine · fondation
        </span>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Le socle tient debout.
        </h1>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Cette page existe pour une seule raison : donner à <code>scripts/verify.sh</code> quelque
          chose de réel à exercer. Le produit se construit derrière elle, une issue à la fois.
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          JOB-001 · fondation vérifiable
        </p>
      </div>
    </main>
  )
}
