import type { NextConfig } from 'next'

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
