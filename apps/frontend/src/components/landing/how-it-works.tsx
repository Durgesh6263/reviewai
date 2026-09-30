import {
  QrCode,
  Star,
  Tags,
  PenLine,
  Sparkles,
  Edit3,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function LandingHowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Scan',
      description: "Customer scans the business's unique ReviewAI QR code.",
      icon: QrCode,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    {
      step: '02',
      title: 'Rate',
      description: 'Customer gives a 1–5 star rating.',
      icon: Star,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      step: '03',
      title: 'Choose',
      description: 'Customer selects 1–3 experience tags configured by the business.',
      icon: Tags,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      step: '04',
      title: 'Add Your Words',
      description: 'Customer can optionally write a short sentence about their experience.',
      icon: PenLine,
      color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    },
    {
      step: '05',
      title: 'AI Assists',
      description: "ReviewAI combines the customer's selected tags and words into a natural editable draft.",
      icon: Sparkles,
      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    },
    {
      step: '06',
      title: 'Review & Edit',
      description: 'Customer reads the draft and can edit it before continuing.',
      icon: Edit3,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    },
    {
      step: '07',
      title: 'Continue to Google',
      description: 'Customer copies the draft and manually pastes/submits it on Google.',
      icon: ExternalLink,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-32 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-blue-600/10 blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            STEP-BY-STEP FLOW
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            From QR scan to customer-approved review.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            A customer-guided flow designed to preserve authentic voice and manual submission.
          </p>
        </div>

        {/* 7 Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.slice(0, 4).map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative rounded-2xl p-6 bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-mono font-bold text-slate-600 group-hover:text-blue-400 transition-colors">
                      STEP {item.step}
                    </span>
                    <div className={`p-2.5 rounded-xl border ${item.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Steps 5, 6, 7 in a 3-column row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-5">
          {steps.slice(4).map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative rounded-2xl p-6 bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-mono font-bold text-slate-600 group-hover:text-amber-400 transition-colors">
                      STEP {item.step}
                    </span>
                    <div className={`p-2.5 rounded-xl border ${item.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Manual submission note */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 p-3.5 px-6 rounded-full bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-400 shadow-md">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Customer copies the draft and manually pastes and submits it on Google. Never automatic review submission.</span>
          </div>
        </div>

      </div>
    </section>
  );
}
