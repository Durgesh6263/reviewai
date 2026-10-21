import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: {
    absolute: 'Transparent Plans & Pricing — ReviewAI',
  },
  description:
    'Explore ReviewAI pricing plans starting from Free (₹0) to Enterprise (₹4,999/mo). Compare monthly and annual billing options with AI review generation and QR quotas.',
  alternates: {
    canonical: 'https://www.review-pilot.store/pricing',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'ReviewAI',
    title: 'Transparent Plans & Pricing — ReviewAI',
    description:
      'Explore ReviewAI pricing plans starting from Free (₹0) to Enterprise (₹4,999/mo). Compare monthly and annual billing options with AI review generation and QR quotas.',
    url: 'https://www.review-pilot.store/pricing',
    images: [
      {
        url: 'https://www.review-pilot.store/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ReviewAI Pricing Plans & Subscription Options',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Transparent Plans & Pricing — ReviewAI',
    description:
      'Explore ReviewAI pricing plans starting from Free (₹0) to Enterprise (₹4,999/mo). Compare monthly and annual billing options with AI review generation and QR quotas.',
    images: ['https://www.review-pilot.store/og-image.png'],
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Can I change plans later?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, you can upgrade or downgrade at any time. Upgrades take effect immediately, while downgrades apply at the start of your next billing cycle.',
        },
      },
      {
        '@type': 'Question',
        name: 'What happens when I hit my plan limits?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "When you reach your monthly QR scan or AI generation limit, new scans/generations will be blocked until your limit resets or you upgrade. You'll see a clear notification with upgrade options.",
        },
      },
      {
        '@type': 'Question',
        name: 'Is there a free trial for paid plans?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We offer a permanently Free plan with 50 QR scans and 20 AI review generations per month so you can test all core features before upgrading.',
        },
      },
      {
        '@type': 'Question',
        name: 'What payment methods do you accept?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We accept UPI, debit cards, credit cards, and net banking via secure Razorpay checkout.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I cancel my subscription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, you can cancel anytime from your dashboard settings. You retain access to your plan features until the end of your billing period.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* Top Header Navigation */}
      <header className="border-b border-secondary-200 dark:border-secondary-800 bg-background/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" aria-label="ReviewAI Home">
            <Sparkles className="h-5 w-5 text-primary-600" />
            <span className="font-bold text-lg text-secondary-900 dark:text-white group-hover:text-primary-600 transition-colors">
              ReviewAI
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white transition-colors font-medium">
              Home
            </Link>
            <Link href="/login" className="text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
