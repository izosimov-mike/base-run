import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { Providers } from '@/components/providers'
import './globals.css'

// Mini App embed configuration
const miniAppEmbed = {
  version: "1",
  imageUrl: "https://base-run.vercel.app/embed.png",
  button: {
    title: "Find your BETR way",
    action: {
      type: "launch_miniapp",
      name: "BETR Run",
      url: "https://base-run.vercel.app",
      splashImageUrl: "https://base-run.vercel.app/icon.png",
      splashBackgroundColor: "#1d1324"
    }
  }
}

export const metadata: Metadata = {
  title: 'BETR Run',
  description: 'Find the hidden letters B, E, T, R to win! A fun puzzle game on Farcaster.',
  icons: {
    icon: '/icon.png',
  },
  openGraph: {
    title: 'BETR Run',
    description: 'Find the hidden letters B, E, T, R to win! A fun puzzle game on Farcaster.',
    images: ['/embed.png'],
  },
  other: {
    'fc:miniapp': JSON.stringify(miniAppEmbed),
    'base:app_id': '697625f488e3bac59cf3d822',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
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
