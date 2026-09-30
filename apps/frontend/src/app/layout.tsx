import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://reviewai.com'),
  title: 'ReviewAI - Collect Authentic Google Reviews',
  description: 'AI-powered QR code flows to help businesses collect authentic Google reviews effortlessly.',
  keywords: ['reviews', 'google reviews', 'QR code', 'AI', 'reputation management', 'customer feedback'],
  authors: [{ name: 'ReviewAI' }],
  creator: 'ReviewAI',
  publisher: 'ReviewAI',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || '/',
    siteName: 'ReviewAI',
    title: 'ReviewAI - Collect Authentic Google Reviews',
    description: 'AI-powered QR code flows to help businesses collect authentic Google reviews effortlessly.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReviewAI Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReviewAI - Collect Authentic Google Reviews',
    description: 'AI-powered QR code flows to help businesses collect authentic Google reviews effortlessly.',
    images: ['/og-image.png'],
  },
  verification: {
    google: 'google-site-verification-code',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark antialiased`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--card)',
                color: 'var(--card-foreground)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                padding: '1rem',
              },
              success: {
                iconTheme: {
                  primary: 'var(--success-500)',
                  secondary: 'var(--success-50)',
                },
              },
              error: {
                iconTheme: {
                  primary: 'var(--error-500)',
                  secondary: 'var(--error-50)',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}