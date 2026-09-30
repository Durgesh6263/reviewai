import {
  Activity,
  Star,
  Tags,
  MessageSquare,
  QrCode,
  Sparkles,
  BarChart3,
} from 'lucide-react';

export function LandingProductShowcase() {
  const dashboardCards = [
    {
      title: 'Review Activity',
      description: 'See customer review activity over time.',
      icon: Activity,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      sampleValue: 'Active Sessions & Velocity',
    },
    {
      title: 'Rating Overview',
      description: 'Understand rating distribution.',
      icon: Star,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      sampleValue: '1★ to 5★ Breakdown',
    },
    {
      title: 'Experience Tags',
      description: 'See which aspects of the business customers mention most.',
      icon: Tags,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      sampleValue: 'Top Tag Highlights',
    },
    {
      title: 'Private Feedback',
      description: 'Review customer feedback that may need internal attention.',
      icon: MessageSquare,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      sampleValue: 'Internal Notes & Resolution',
    },
    {
      title: 'QR Activity',
      description: 'Understand how your QR experience is being used.',
      icon: QrCode,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      sampleValue: 'Scans & Location Counts',
    },
    {
      title: 'AI Usage',
      description: 'Track AI-assisted review activity.',
      icon: Sparkles,
      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
      sampleValue: 'Generations & Draft Copies',
    },
  ];

  return (
    <section id="dashboard" className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <BarChart3 className="w-3.5 h-3.5" />
            BUSINESS DASHBOARD
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Understand what your customers are saying.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Gain clear, actionable visibility into your real customer feedback and review flow.
          </p>
        </div>

        {/* 6 Dashboard Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-xl border ${card.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800">
                      {card.sampleValue}
                    </span>
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
