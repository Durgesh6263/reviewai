'use client';

import { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

export function LandingFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Does the customer need to create an account?',
      a: 'No. The customer review flow is designed to work without customer login.',
    },
    {
      q: 'Does ReviewAI automatically post reviews to Google?',
      a: 'No. The customer copies the draft and manually continues to Google and submits the review themselves.',
    },
    {
      q: 'Who writes the review?',
      a: 'The customer provides the underlying experience and input. AI assists with wording and structure.',
    },
    {
      q: 'Can customers edit the AI-generated draft?',
      a: 'Yes. The draft is editable before the customer continues to Google.',
    },
    {
      q: 'What happens if a customer gives a low rating?',
      a: 'ReviewAI can collect private feedback for lower ratings, but customers should not be blocked from accessing Google based on their rating.',
    },
    {
      q: 'Can businesses customize the experience tags?',
      a: 'Yes. Businesses can configure their own experience tags.',
    },
    {
      q: 'Does ReviewAI require Google Business Profile API access?',
      a: 'The current MVP can use a Google Maps listing link/manual Place ID approach. Deeper Business Profile integration can be added later.',
    },
    {
      q: 'Can I download the QR code?',
      a: 'Yes. The business can generate and use its unique QR code for customer access.',
    },
    {
      q: 'Does ReviewAI guarantee Google policy compliance?',
      a: 'No platform should promise a guaranteed outcome. ReviewAI is designed around customer authorship, customer editing and manual submission rather than automatic review posting.',
    },
  ];

  return (
    <section id="faq" className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <HelpCircle className="w-3.5 h-3.5" />
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Frequently Asked Questions
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Clear, straightforward answers about how ReviewAI works for you and your customers.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={faq.q}
                className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden transition-colors hover:border-slate-700"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 focus:outline-none"
                >
                  <span className="text-base sm:text-lg font-bold text-white leading-snug">
                    {faq.q}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-blue-400' : 'text-slate-400'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 sm:px-6 pb-6 pt-1 text-sm sm:text-base text-slate-300 leading-relaxed border-t border-slate-800/60">
                      {faq.a}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
