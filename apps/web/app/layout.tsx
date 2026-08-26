import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { SCRIPT_ANTI_CLIGNOTEMENT, value } from '@job-seeker/ui'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cabine',
  description: "Un agent qui cherche du travail à votre place, et vous rend des comptes.",
}

// Même la couleur de chrome du navigateur vient du système : c'est la première
// surface que l'utilisateur voit, et elle n'a aucune raison de diverger.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: value('surface-page', 'dark') },
    { media: '(prefers-color-scheme: light)', color: value('surface-page', 'light') },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/*
          Posé AVANT la première peinture. Appliqué après l'hydratation, un
          utilisateur en mode sombre recevrait un éclair blanc à chaque
          navigation — sur un produit qu'on consulte la nuit, ce n'est pas un
          détail esthétique.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_CLIGNOTEMENT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
