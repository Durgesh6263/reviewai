'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LandingPricingPreview() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const plans = [
    {
      name: 'Free',
      slug: 'free',
      description: 'Ideal for testing ReviewAI with your first customer reviews.',
      price: { monthly: 0, yearly: 0 },
      badge: 'Free Plan',
      popular: false,
      features: [
        '50 QR Scans / month',
        '20 AI Review Generations',
        '1 High-Resolution QR Code',
        'Standard Google Review Link',
        'Private Feedback Form',
        'Standard Email Support',
      ],
      cta: 'Start Using ReviewAI',
      buttonVariant: 'outline' as const,
    },
    {
      name: 'Starter',
      slug: 'starter',
      description: 'For growing local businesses looking to build strong review momentum.',
      price: { monthly: 29, yearly: 24 },
      badge: 'Most Popular',
      popular: true,
      features: [
        '500 QR Scans / month',
        '250 AI Review Generations',
        '3 Custom Location QR Codes',
        'Configurable Experience Tags',
        'Conversion Activity Analytics',
        'Multi-Language Review Support',
        'Priority Email Support',
      ],
      cta: 'Start Using ReviewAI',
      buttonVariant: 'default' as const,
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For busy high-volume locations that need maximum review flow.',
      price: { monthly: 79, yearly: 64 },
      badge: 'Best for Scale',
      popular: false,
      features: [
        '2,500 QR Scans / month',
        '1,500 AI Review Generations',
        '10 Branded QR Codes & Frames',
        'Multi-Staff Access',
        'Advanced Usage Analytics',
        'Private Feedback Management',
        'Priority Phone & Chat Support',
      ],
      cta: 'Start Using ReviewAI',
      buttonVariant: 'outline' as const,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For multi-location franchises, fitness chains, and restaurant groups.',
      price: { monthly: 199, yearly: 159 },
      badge: 'Multi-Location',
      popular: false,
      features: [
        'Unlimited QR Scans',
        'Unlimited AI Generations',
        'Unlimited Location QR Codes',
        'Custom Domain Setup',
        'API & Webhook Access',
        'Dedicated Support Manager',
        'Multi-Location Reporting',
      ],
      cta: 'Start Using ReviewAI',
      buttonVariant: 'outline' as const,
    },
  ];

  return (
    <section id="pricing" className="py-20 md:py-32 bg-slate-900/40 relative border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            PRICING
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Simple plans for growing businesses.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Choose the plan that fits your business and customer activity.
          </p>

          {/* Billing Switch */}
          <div className="mt-8 inline-flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                billingPeriod === 'yearly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Annual Billing
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isStarter = plan.popular;
            const currentPrice = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;

            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 ${
                  isStarter
                    ? 'bg-gradient-to-b from-blue-950/60 to-slate-900 border-2 border-blue-500 shadow-2xl shadow-blue-950/50 scale-[1.02]'
                    : 'bg-slate-950/80 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Popular Pill */}
                {isStarter && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-bold tracking-wide uppercase shadow-lg shadow-blue-500/40">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                      {plan.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-5 min-h-[32px]">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6 pb-6 border-b border-slate-800">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-white">${currentPrice}</span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>
                    {billingPeriod === 'yearly' && plan.price.monthly > 0 && (
                      <span className="text-[11px] text-emerald-400 block mt-1">
                        Billed annually (${currentPrice * 12}/yr)
                      </span>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-2.5 mb-8">
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link href="/register" className="w-full">
                  <Button
                    variant={isStarter ? 'default' : 'outline'}
                    className={`w-full h-11 text-xs font-semibold rounded-xl ${
                      isStarter
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
