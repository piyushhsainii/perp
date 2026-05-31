import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://perp.vercel.app'),

  title: {
    default: 'PERP/DEX — Perpetual Futures Exchange',
    template: '%s | PERP/DEX',
  },

  description:
    'Production-grade perpetual futures exchange simulator powered by a Rust matching engine, real-time orderbook streaming, funding rates, liquidations, and leverage trading.',

  applicationName: 'PERP/DEX',

  keywords: [
    'PERP/DEX',
    'Perpetual Futures',
    'Crypto Exchange',
    'DEX',
    'Rust',
    'Next.js',
    'Trading Simulator',
    'Orderbook',
    'WebSocket',
    'Matching Engine',
    'Funding Rate',
    'Liquidation Engine',
    'BTC-PERP',
    'ETH-PERP',
    'Crypto Derivatives',
  ],

  authors: [
    {
      name: 'Your Name',
      url: 'https://perp.vercel.app',
    },
  ],

  creator: 'Your Name',
  publisher: 'Your Name',

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://perp.vercel.app',
    siteName: 'PERP/DEX',

    title: 'PERP/DEX — Perpetual Futures Exchange',

    description:
      'A production-grade perpetual futures trading simulator featuring a Rust matching engine, live orderbook streaming, liquidations, funding rates, and leverage trading.',

    images: [
      {
        url: '/preview.png',
        width: 1200,
        height: 630,
        alt: 'PERP/DEX Trading Terminal',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'PERP/DEX — Perpetual Futures Exchange',

    description:
      'Rust-powered perpetual futures exchange simulator with real-time orderbook, funding rates, liquidations, and leverage trading.',

    images: ['/preview.png'],
  },

  alternates: {
    canonical: 'https://perp.vercel.app',
  },

  category: 'Finance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-poppins scanline">
        {children}
      </body>
    </html>
  )
}