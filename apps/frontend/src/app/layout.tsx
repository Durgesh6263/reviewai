import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'react-hot-toast';

import { getCanonicalSiteUrl } from '@/lib/public-url';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const canonicalBaseUrl = getCanonicalSiteUrl();

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ReviewAI',
  url: 'https://www.review-pilot.store/',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'ReviewAI helps businesses collect authentic customer reviews through QR codes and turn customer-provided feedback into natural, editable AI-assisted review drafts.',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'INR',
    lowPrice: '0',
    highPrice: '4999',
    offerCount: '4',
    offers: [
      {
        '@type': 'Offer',
        name: 'Free Plan',
        price: '0',
        priceCurrency: 'INR',
        description: '50 QR Scans / month, 20 AI Review Generations, 1 High-Resolution QR Code.',
      },
      {
        '@type': 'Offer',
        name: 'Starter Plan',
        price: '499',
        priceCurrency: 'INR',
        description: '500 QR Scans / month, 250 AI Review Generations, 3 Custom Location QR Codes.',
      },
      {
        '@type': 'Offer',
        name: 'Pro Plan',
        price: '1499',
        priceCurrency: 'INR',
        description: '2,500 QR Scans / month, 1,500 AI Review Generations, 10 Branded QR Codes & Frames.',
      },
      {
        '@type': 'Offer',
        name: 'Enterprise Plan',
        price: '4999',
        priceCurrency: 'INR',
        description: 'Unlimited QR Scans, Unlimited AI Generations, Custom Domain Setup, API Access.',
      },
    ],
  },
  featureList: [
    'QR-based customer review collection',
    'AI-assisted review draft polishing',
    'Customer-in-control review editing',
    'Private feedback for lower ratings without blocking Google access',
    'Review activity analytics and tag insights',
    'Multi-language customer review engine',
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.review-pilot.store'),
  title: {
    default: 'ReviewAI — AI-Assisted Google Review Collection & QR Feedback Platform',
    template: '%s | ReviewAI',
  },
  description:
    'Collect authentic Google reviews in-person with ReviewAI. Customers scan your custom QR code, share feedback, and AI crafts natural, customer-controlled review drafts.',
  keywords: [
    'Google review collection',
    'QR code review system',
    'customer feedback QR',
    'AI review assistant',
    'in-person customer reviews',
    'business review management',
    'authentic Google reviews',
  ],
  authors: [{ name: 'ReviewAI' }],
  creator: 'ReviewAI',
  publisher: 'ReviewAI',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://www.review-pilot.store/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.review-pilot.store/',
    siteName: 'ReviewAI',
    title: 'ReviewAI — AI-Assisted Google Review Collection & QR Feedback Platform',
    description:
      'Collect authentic Google reviews in-person with ReviewAI. Customers scan your custom QR code, share feedback, and AI crafts natural, customer-controlled review drafts.',
    images: [
      {
        url: 'https://www.review-pilot.store/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReviewAI — Turn Real Customer Experiences Into Better Google Reviews',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReviewAI — AI-Assisted Google Review Collection & QR Feedback Platform',
    description:
      'Collect authentic Google reviews in-person with ReviewAI. Customers scan your custom QR code, share feedback, and AI crafts natural, customer-controlled review drafts.',
    images: ['https://www.review-pilot.store/og-image.png'],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationSchema),
          }}
        />
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