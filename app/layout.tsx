import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { Providers } from '@/components/providers'
import './globals.css'

// Mini App embed configuration
const miniAppEmbed = {
  version: "1",
  imageUrl: "https://base-run.vercel.app/background.png",
  button: {
    title: "▶️ Play Now",
    action: {
      type: "launch_miniapp",
      name: "Base Run",
      url: "https://base-run.vercel.app",
      splashImageUrl: "https://base-run.vercel.app/icon.svg",
      splashBackgroundColor: "#5b616e"
    }
  }
}

export const metadata: Metadata = {
  title: 'B.A.S.E. Run',
  description: 'Find the hidden letters B, A, S, E to win! A fun Phaser-based puzzle game on Farcaster.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'B.A.S.E. Run',
    description: 'Find the hidden letters B, A, S, E to win! A fun puzzle game on Farcaster.',
    images: ['/background.png'],
  },
  other: {
    'fc:miniapp': JSON.stringify(miniAppEmbed),
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`} style={{ fontFamily: 'Stengazeta, sans-serif' }}>
        <Script
          src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"
          strategy="beforeInteractive"
        />
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
