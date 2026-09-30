import {
  UserCheck,
  Edit3,
  ExternalLink,
  ShieldCheck,
  Unlock,
  Sparkles,
} from 'lucide-react';

export function LandingTrustSafety() {
  const trustCards = [
    {
      title: 'Real Customer Input',
      description: 'Customer information starts the review.',
      icon: UserCheck,
    },
    {
      title: 'Editable Draft',
      description: 'The AI-generated draft can be changed by the customer.',
      icon: Edit3,
    },
    {
      title: 'Manual Submission',
      description: 'The customer manually continues to Google.',
      icon: ExternalLink,
    },
    {
      title: 'No Auto-Posting',
      description: 'ReviewAI does not automatically submit reviews to Google.',
      icon: ShieldCheck,
    },
    {
      title: 'Open Access',
      description: 'Customers should not be blocked from accessing Google based on their rating.',
      icon: Unlock,
    },
    {
      title: 'Transparent Assistance',
      description: 'AI is used to help express customer-provided experiences.',
      icon: Sparkles,
    },
  ];

  return (
    <section id="trust-safety" className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 mb-4 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            CUSTOMER CONTROL & TRUST
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            The customer stays in control.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Designed to preserve customer authorship and manual submission.
          </p>
        </div>

        {/* 6 Trust Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {trustCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{card.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{card.description}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
