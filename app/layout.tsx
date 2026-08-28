import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://typerival.robert-perez2132.chatgpt.site'),
  title: {
    default: 'TypeRival — Competitive Typing',
    template: '%s · TypeRival',
  },
  description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
  applicationName: 'TypeRival',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TypeRival',
  },
  formatDetection: { telephone: false },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'TypeRival',
    title: 'TypeRival — The fastest thumbs win',
    description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TypeRival — The fastest thumbs win' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TypeRival — The fastest thumbs win',
    description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07111f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
