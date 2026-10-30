import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Mona_Sans } from 'next/font/google'
import './globals.css'
import { RegisterServiceWorker } from '@/components/pwa'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const sans = Mona_Sans({ subsets: ['latin'], variable: '--font-mona' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: { default: 'Helm', template: '%s · Helm' },
  description: 'Projects, requests, approvals and updates with Seven Billion, in one place.',
  robots: { index: false, follow: false },
  applicationName: 'Helm',
  appleWebApp: { capable: true, title: 'Helm', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fafafa',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen"><TooltipProvider delayDuration={300}>{children}</TooltipProvider><Toaster position="bottom-right" closeButton /><RegisterServiceWorker /></body>
    </html>
  )
}
