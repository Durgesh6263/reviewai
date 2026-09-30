import { UserCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export function LandingAIAssistant() {
  const points = [
    {
      title: 'Customer Input First',
      description: 'The review starts with customer-provided information.',
      icon: UserCheck,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    {
      title: 'Natural Language',
      description: 'AI can improve wording, grammar, structure and readability.',
      icon: Sparkles,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      title: 'Customer Approval',
      description: 'The customer sees and edits the draft before using it.',
      icon: CheckCircle2,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
  ];

  return (
    <section id="ai-assistant" className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Customer-authored · AI-assisted
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            AI that assists the customer&apos;s voice — not replaces it.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            ReviewAI uses AI to help customers express what they already experienced.
          </p>
        </div>

        {/* 3 Points Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {points.map((pt, idx) => {
            const Icon = pt.icon;
            return (
              <div
                key={pt.title}
                className="rounded-2xl p-8 bg-slate-950/80 border border-slate-800 shadow-xl flex flex-col items-start hover:border-slate-700 hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`p-3 rounded-2xl border ${pt.color} mb-6`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{pt.title}</h3>
                <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                  {pt.description}
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
