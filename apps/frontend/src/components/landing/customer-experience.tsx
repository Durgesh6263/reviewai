import {
  QrCode,
  Star,
  Tag,
  PenTool,
  Sparkles,
  Edit2,
  ExternalLink,
  Clock,
} from 'lucide-react';

export function LandingCustomerExperience() {
  const steps = [
    { title: 'Scan the QR.', icon: QrCode },
    { title: 'Choose your rating.', icon: Star },
    { title: 'Select what stood out.', icon: Tag },
    { title: 'Add a short thought.', icon: PenTool },
    { title: 'Review the AI draft.', icon: Sparkles },
    { title: 'Edit if needed.', icon: Edit2 },
    { title: 'Continue to Google.', icon: ExternalLink },
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 mb-4 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            CUSTOMER EXPERIENCE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Designed to take seconds, not minutes.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            A linear, distraction-free journey that respects the customer&apos;s time.
          </p>
        </div>

        {/* Visual Timeline */}
        <div className="relative">
          {/* Connecting line on desktop */}
          <div className="hidden lg:block absolute top-1/2 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-600 via-amber-500 to-emerald-500 -translate-y-1/2 z-0 opacity-40" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 relative z-10">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-xl p-4 bg-slate-900 border border-slate-800 text-center flex flex-col items-center justify-between min-h-[140px] shadow-lg group hover:border-slate-700 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-300 mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    {idx + 1}
                  </div>
                  <div className="text-slate-300 group-hover:text-white mb-2">
                    <Icon className="w-5 h-5 mx-auto" />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-white leading-snug">
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
