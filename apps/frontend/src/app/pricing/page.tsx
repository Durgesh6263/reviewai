'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { Check, X, Sparkles, Shield, Zap, Globe, Lock, Users, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { cn, formatNumber } from '@/lib/utils';

const formatLimit = (limit: number) => {
  if (limit === -1) return 'Unlimited';
  return limit.toLocaleString();
};

interface Plan {
  name: string;
  slug: string;
  monthly_qr_scans: number;
  monthly_ai_generations: number;
  features: {
    custom_domain: boolean;
    advanced_analytics: boolean;
    api_access: boolean;
    white_label: boolean;
    priority_support: boolean;
    ai_reviews: boolean;
  };
}

interface PlansResponse {
  data: Plan[];
}

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  free: Sparkles,
  starter: Zap,
  pro: Shield,
  enterprise: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  free: 'border-secondary-200 dark:border-secondary-700',
  starter: 'border-blue-200 dark:border-blue-800',
  pro: 'border-purple-200 dark:border-purple-800',
  enterprise: 'border-amber-200 dark:border-amber-800',
};

const PLAN_HIGHLIGHT: Record<string, string> = {
  free: 'bg-secondary-50 dark:bg-secondary-900/50',
  starter: 'bg-blue-50 dark:bg-blue-900/20',
  pro: 'bg-purple-50 dark:bg-purple-900/20',
  enterprise: 'bg-amber-50 dark:bg-amber-900/20',
};

const FEATURES_LIST = [
  { key: 'ai_reviews', label: 'AI Review Generation', icon: Sparkles },
  { key: 'custom_domain', label: 'Custom Domain', icon: Globe },
  { key: 'advanced_analytics', label: 'Advanced Analytics', icon: Zap },
  { key: 'api_access', label: 'API Access', icon: Shield },
  { key: 'white_label', label: 'White Label', icon: Crown },
  { key: 'priority_support', label: 'Priority Support', icon: Users },
] as const;

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setIsLoading(true);
        const response = await api.get<PlansResponse>('/subscription/plans');
        // Sort plans in order: free, starter, pro, enterprise
        const order = ['free', 'starter', 'pro', 'enterprise'];
        const sorted = [...response.data].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
        setPlans(sorted);
      } catch (err: any) {
        console.error('Failed to fetch plans:', err);
        setError(err.response?.data?.message || 'Failed to load pricing plans');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const formatLimit = (limit: number) => {
    if (limit === -1) return 'Unlimited';
    return limit.toLocaleString();
  };

  const getPlanPrice = (plan: Plan) => {
    // These would come from the backend in a real app
    const prices: Record<string, { monthly: number; yearly: number }> = {
      free: { monthly: 0, yearly: 0 },
      starter: { monthly: 29, yearly: 24 },
      pro: { monthly: 79, yearly: 65 },
      enterprise: { monthly: 199, yearly: 165 },
    };
    return prices[plan.slug] || { monthly: 0, yearly: 0 };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 animate-pulse">
            <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3 mx-auto mb-4" />
            <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                  <div className="h-12 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3" />
                  <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-full" />
                  <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4" />
                  <div className="space-y-3 pt-4">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <div key={j} className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded" />
                    ))}
                  </div>
                  <div className="h-10 bg-secondary-200 dark:bg-secondary-700 rounded mt-6" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background py-20 px-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-error-500 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-primary-50 dark:from-primary-900/20 to-background">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-secondary-900 dark:text-white mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-secondary-600 dark:text-secondary-400 max-w-3xl mx-auto mb-10">
            Choose the plan that fits your business. All plans include AI-powered review generation.
            No hidden fees. Cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
            <span className={cn('text-sm font-medium', billingPeriod === 'monthly' ? 'text-secondary-900 dark:text-white' : 'text-secondary-500')}>
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                billingPeriod === 'yearly' ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-secondary-600'
              )}
              role="switch"
              aria-checked={billingPeriod === 'yearly'}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
                  billingPeriod === 'yearly' ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
            <span className={cn('text-sm font-medium', billingPeriod === 'yearly' ? 'text-secondary-900 dark:text-white' : 'text-secondary-500')}>
              Yearly
              <Badge variant="secondary" className="ml-2 text-xs">Save 20%</Badge>
            </span>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.slug}
                plan={plan}
                billingPeriod={billingPeriod}
                price={getPlanPrice(plan)}
                isPopular={plan.slug === 'pro'}
              />
            ))}
          </div>

          {/* Feature Comparison Table */}
          <div className="mt-20 overflow-x-auto">
            <h2 className="text-2xl font-bold text-secondary-900 dark:text-white text-center mb-10">
              Feature Comparison
            </h2>
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-secondary-200 dark:border-secondary-700">
                  <th className="text-left p-4 font-medium text-secondary-600 dark:text-secondary-400">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.slug} className="text-center p-4 font-medium text-secondary-900 dark:text-white">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
                {/* QR Scans */}
                <tr>
                  <td className="p-4 font-medium text-secondary-700 dark:text-secondary-300">Monthly QR Scans</td>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="text-center p-4 text-secondary-900 dark:text-white font-mono">
                      {formatLimit(plan.monthly_qr_scans)}
                    </td>
                  ))}
                </tr>
                {/* AI Generations */}
                <tr>
                  <td className="p-4 font-medium text-secondary-700 dark:text-secondary-300">Monthly AI Generations</td>
                  {plans.map((plan) => (
                    <td key={plan.slug} className="text-center p-4 text-secondary-900 dark:text-white font-mono">
                      {formatLimit(plan.monthly_ai_generations)}
                    </td>
                  ))}
                </tr>
                {/* Features */}
                {FEATURES_LIST.map((feature) => (
                  <tr key={feature.key}>
                    <td className="p-4 flex items-center gap-2 text-secondary-700 dark:text-secondary-300">
                      <feature.icon className="h-4 w-4 text-secondary-400" />
                      {feature.label}
                    </td>
                    {plans.map((plan) => (
                      <td key={plan.slug} className="text-center p-4">
                        {plan.features[feature.key as keyof typeof plan.features] ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-secondary-300 dark:text-secondary-600 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA for logged in users */}
          <div className="mt-16 text-center">
            <p className="text-secondary-600 dark:text-secondary-400 mb-4">
              Already have an account?
            </p>
            <Link href="/dashboard/settings?tab=subscription">
              <Button size="lg">
                Manage Your Plan
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 bg-secondary-50 dark:bg-secondary-900/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-secondary-900 dark:text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {FAQS.map((faq, index) => (
              <details key={index} className="group bg-background rounded-xl border border-secondary-200 dark:border-secondary-700 p-6">
                <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-secondary-900 dark:text-white">
                  {faq.q}
                  <span className="text-primary-600 dark:text-primary-400">+</span>
                </summary>
                <p className="mt-4 text-secondary-600 dark:text-secondary-400">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan, billingPeriod, price, isPopular }: {
  plan: Plan;
  billingPeriod: 'monthly' | 'yearly';
  price: { monthly: number; yearly: number };
  isPopular: boolean;
}) {
  const currentPrice = billingPeriod === 'yearly' ? price.yearly : price.monthly;
  const periodLabel = billingPeriod === 'yearly' ? '/year' : '/month';
  const isFree = plan.slug === 'free';

  return (
    <Card
      className={cn(
        'relative flex flex-col h-full transition-all duration-200',
        PLAN_COLORS[plan.slug],
        isPopular && 'ring-2 ring-primary-500 dark:ring-primary-400 shadow-lg',
        PLAN_HIGHLIGHT[plan.slug]
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary-600 text-white px-3 py-1 text-xs">Most Popular</Badge>
        </div>
      )}

      <CardHeader className="pb-4 border-b border-secondary-200 dark:border-secondary-700">
        <div className="flex items-center justify-center gap-2 mb-3">
          {(() => {
            const Icon = PLAN_ICONS[plan.slug] || Crown;
            return <Icon className={cn('h-6 w-6', isPopular ? 'text-primary-600' : 'text-secondary-600')} />;
          })()}
          <CardTitle className="text-xl capitalize">{plan.name}</CardTitle>
        </div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-secondary-900 dark:text-white">
            {isFree ? 'Free' : `$${currentPrice}`}
          </span>
          {!isFree && (
            <span className="text-secondary-500 dark:text-secondary-400">{periodLabel}</span>
          )}
        </div>
        {!isFree && billingPeriod === 'yearly' && (
          <p className="text-center text-sm text-green-600 dark:text-green-400 mt-1">
            Billed ${price.yearly * 12}/year
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Limits */}
        <div className="space-y-3 p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-secondary-600 dark:text-secondary-400">QR Scans/month</span>
            <span className="font-medium text-secondary-900 dark:text-white font-mono">
              {formatLimit(plan.monthly_qr_scans)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-secondary-600 dark:text-secondary-400">AI Generations/month</span>
            <span className="font-medium text-secondary-900 dark:text-white font-mono">
              {formatLimit(plan.monthly_ai_generations)}
            </span>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-3">
          {FEATURES_LIST.map((feature) => (
            <li key={feature.key} className="flex items-center gap-3 text-sm">
              {plan.features[feature.key as keyof typeof plan.features] ? (
                <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
              ) : (
                <X className="h-5 w-5 text-secondary-300 dark:text-secondary-600 flex-shrink-0" />
              )}
              <span className={cn(
                'flex-1 text-left',
                plan.features[feature.key as keyof typeof plan.features]
                  ? 'text-secondary-700 dark:text-secondary-300'
                  : 'text-secondary-500 dark:text-secondary-400'
              )}>
                {feature.label}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <Link href={isFree ? '/register' : `/dashboard/settings?tab=subscription&upgrade=true&plan=${plan.slug}`}>
          <Button
            className={cn('w-full mt-auto', isPopular ? 'bg-primary-600 hover:bg-primary-700' : 'bg-primary-600 hover:bg-primary-700', isFree && 'bg-secondary-100 dark:bg-secondary-800 text-secondary-900 dark:text-white hover:bg-secondary-200 dark:hover:bg-secondary-700')}
          >
            {isFree ? 'Get Started Free' : 'Upgrade Now'}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

const FAQS = [
  {
    q: 'Can I change plans later?',
    a: 'Yes, you can upgrade or downgrade at any time. Upgrades take effect immediately, while downgrades apply at the start of your next billing cycle.',
  },
  {
    q: 'What happens when I hit my plan limits?',
    a: 'When you reach your monthly QR scan or AI generation limit, new scans/generations will be blocked until your limit resets or you upgrade. You\'ll see a clear notification with upgrade options.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'We don\'t offer free trials on paid plans, but our Free plan lets you test the core features with 50 QR scans and 10 AI generations per month.',
  },
  {
    q: 'Do you offer discounts for nonprofits or educational institutions?',
    a: 'Yes! Contact our sales team for special pricing for registered nonprofits, educational institutions, and high-volume enterprise customers.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards (Visa, Mastercard, Amex) via Stripe. Annual plans can also be paid via invoice for Enterprise customers.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes, you can cancel anytime from your dashboard settings. You\'ll retain access to your plan features until the end of your billing period.',
  },
];