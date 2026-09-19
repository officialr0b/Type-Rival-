import type { Metadata, Viewport } from 'next';
import PrivacyAnalytics from './privacy-analytics';
import './globals.css';

const themeBootScript = `try{var t=localStorage.getItem('typerival:theme:v1')==='light'?'light':'dark';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

const deploymentHost = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  ?? 'https://www.typerival.com';

export const metadata: Metadata = {
  metadataBase: new URL(deploymentHost),
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
    title: 'TypeRival — The fastest typist wins',
    description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'TypeRival — The fastest typist wins' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TypeRival — The fastest typist wins',
    description: 'Practice your speed, challenge friends, and climb the competitive typing ladder.',
    images: ['/og.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07111f',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>
        {children}
        <PrivacyAnalytics />
      </body>
    </html>
  );
}
