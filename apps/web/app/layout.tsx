import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cabine',
  description: "Un agent qui cherche du travail à votre place, et vous rend des comptes.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111218' },
    { media: '(prefers-color-scheme: light)', color: '#F1F2F7' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
