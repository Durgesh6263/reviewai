import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing Plans — ReviewAI',
  description:
    'Simple, transparent pricing for growing businesses. Choose the plan that fits your business and review volume.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Pricing Plans — ReviewAI',
    description:
      'Simple, transparent pricing for growing businesses. Choose the plan that fits your business and review volume.',
    url: '/pricing',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
