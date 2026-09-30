import {
  Sparkles,
  Tag,
  QrCode,
  MessageSquare,
  BarChart2,
  Globe2,
  LayoutDashboard,
  ShieldCheck,
  Check,
} from 'lucide-react';

export function LandingFeatures() {
  const features = [
    {
      icon: Sparkles,
      title: 'AI-Assisted Review Writing',
      description:
        'Combines customer ratings, selected tags, and optional notes to create a natural, editable review draft.',
      color: 'from-blue-600 to-indigo-600',
      badge: 'Core Engine',
    },
    {
      icon: Tag,
      title: 'Configurable Experience Tags',
      description:
        'Businesses can customize short tags reflecting what their customers value most.',
      color: 'from-indigo-600 to-violet-600',
      badge: 'Customizable',
    },
    {
      icon: QrCode,
      title: 'Unique Business QR Code',
      description:
        'Generate and download unique QR codes suitable for table tents, counters, receipts, and stickers.',
      color: 'from-violet-600 to-purple-600',
      badge: 'Printable',
    },
    {
      icon: MessageSquare,
      title: 'Private Customer Feedback',
      description:
        'Collect private feedback on lower ratings so businesses can address issues and improve operations.',
      color: 'from-amber-600 to-orange-600',
      badge: 'Private Insights',
    },
    {
      icon: BarChart2,
      title: 'Review Activity Analytics',
      description:
        'Track QR scans, review activity, experience tag mentions, and AI generation usage over time.',
      color: 'from-cyan-600 to-blue-600',
      badge: 'Real-time Metrics',
    },
    {
      icon: Globe2,
      title: 'Multi-Language Experience',
      description:
        'Supports reviews in English, Hindi, and Hinglish for smooth customer communication.',
      color: 'from-emerald-600 to-teal-600',
      badge: 'Multilingual',
    },
    {
      icon: LayoutDashboard,
      title: 'Unified Dashboard',
      description:
        'See your QR code, customer reviews, ratings distribution, and private feedback in one place.',
      color: 'from-blue-600 to-cyan-600',
      badge: 'Control Center',
    },
    {
      icon: ShieldCheck,
      title: 'Customer Autonomy',
      description:
        'Designed around customer authorship, customer editing, and manual submission directly to Google.',
      color: 'from-purple-600 to-pink-600',
      badge: 'Customer Control',
    },
  ];

  return (
    <section id="features" className="py-20 md:py-32 bg-slate-950 relative border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            FEATURES
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Key ReviewAI Platform Features
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            Everything your business needs to turn customer experiences into natural Google reviews.
          </p>
        </div>

        {/* Bento Grid Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="group relative p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${feat.color} p-0.5 shadow-lg group-hover:scale-110 transition-transform`}>
                      <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
                      {feat.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center text-xs text-blue-400 font-medium">
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  Included in ReviewAI
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
