import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { LandingNavbar } from '@/components/landing/navbar';
import { LandingHero } from '@/components/landing/hero';
import { LandingAbout } from '@/components/landing/about';
import { LandingProblem } from '@/components/landing/problem';
import { LandingHowItWorks } from '@/components/landing/how-it-works';
import { LandingAIAssistant } from '@/components/landing/ai-assistant';
import { LandingExperienceTags } from '@/components/landing/experience-tags';
import { LandingQRSystem } from '@/components/landing/qr-system';
import { LandingCustomerExperience } from '@/components/landing/customer-experience';
import { LandingDifferentiation } from '@/components/landing/differentiation';
import { LandingTrustSafety } from '@/components/landing/trust-safety';
import { LandingPrivateFeedback } from '@/components/landing/private-feedback';
import { LandingProductShowcase } from '@/components/landing/product-showcase';
import { LandingMultilingual } from '@/components/landing/multilingual';
import { LandingIndustries } from '@/components/landing/industries';
import { LandingBusinessBenefits } from '@/components/landing/business-benefits';
import { LandingFAQ } from '@/components/landing/faq';
import { LandingPricingPreview } from '@/components/landing/pricing-preview';
import { LandingFinalCTA } from '@/components/landing/final-cta';
import { LandingFooter } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'ReviewAI — AI-Assisted Customer Review Collection',
  description:
    'ReviewAI helps businesses collect genuine customer feedback through QR codes and turn customer-provided input into editable AI-assisted review drafts.',
  keywords: [
    'AI review assistant',
    'QR review system',
    'Google review QR code',
    'customer feedback platform',
    'AI-assisted reviews',
    'business review collection',
    'customer feedback QR',
    'review management',
    'ReviewAI',
  ],
  openGraph: {
    title: 'ReviewAI — AI-Assisted Customer Review Collection',
    description:
      'ReviewAI helps businesses collect genuine customer feedback through QR codes and turn customer-provided input into editable AI-assisted review drafts.',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReviewAI — AI-Assisted Customer Review Collection',
    description:
      'ReviewAI helps businesses collect genuine customer feedback through QR codes and turn customer-provided input into editable AI-assisted review drafts.',
  },
};

export default function LandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ReviewAI',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'ReviewAI helps businesses collect genuine customer feedback through QR codes and turn customer-provided input into editable AI-assisted review drafts.',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Structured SEO Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Floating Glassmorphic Navbar */}
      <LandingNavbar />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* Section 2: Hero */}
        <LandingHero />

        {/* Section 3: About ReviewAI */}
        <LandingAbout />

        {/* Section 4: What Problem ReviewAI Solves */}
        <LandingProblem />

        {/* Section 5: How ReviewAI Works (7 Steps) */}
        <LandingHowItWorks />

        {/* Section 6: AI Review Assistant */}
        <LandingAIAssistant />

        {/* Section 7: Experience Tags */}
        <LandingExperienceTags />

        {/* Section 8: QR Code System */}
        <LandingQRSystem />

        {/* Section 9: Customer Experience Timeline */}
        <LandingCustomerExperience />

        {/* Section 16: Differentiation (Not an auto-review bot) */}
        <LandingDifferentiation />

        {/* Section 10: Customer Control / Trust */}
        <LandingTrustSafety />

        {/* Section 11: Private Feedback */}
        <LandingPrivateFeedback />

        {/* Section 12: Business Dashboard */}
        <LandingProductShowcase />

        {/* Section 13: Multi-Language Experience */}
        <LandingMultilingual />

        {/* Section 14: Who is ReviewAI For? */}
        <LandingIndustries />

        {/* Section 15: Business Benefits */}
        <LandingBusinessBenefits />

        {/* Section 17: FAQ */}
        <LandingFAQ />

        {/* Section 18: Pricing Intro */}
        <LandingPricingPreview />

        {/* Section 19: Final CTA */}
        <LandingFinalCTA />
      </main>

      {/* Section 20 & 21: Footer */}
      <LandingFooter />
    </div>
  );
}
