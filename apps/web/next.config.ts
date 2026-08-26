import { join } from 'node:path'
import { config as chargerEnv } from 'dotenv'
import type { NextConfig } from 'next'

// Un monorepo, un seul fichier d'environnement — à la RACINE. Next ne cherche
// que dans le dossier de l'application, donc on le lui dit. Sans cela, le
// client Supabase se construit sans URL ni clé et la page rend une erreur, ce
// que seul le smoke aurait attrapé.
chargerEnv({ path: join(import.meta.dirname, '..', '..', '.env'), quiet: true })

const config: NextConfig = {
  reactStrictMode: true,
  // Le paquet d'interface est publié en TypeScript brut dans l'espace de
  // travail : Next doit le transpiler plutôt que l'attendre pré-construit.
  transpilePackages: ['@job-seeker/ui'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default config
