import {
  Sparkles,
  SmilePlus,
  Clock,
  LayoutTemplate,
  LineChart,
  Zap,
  UserCheck,
} from 'lucide-react';

export function LandingBusinessBenefits() {
  const benefits = [
    {
      title: 'Make Reviews Easier',
      description: 'Reduce the effort customers need to write a review.',
      icon: SmilePlus,
    },
    {
      title: 'Capture Real Experiences',
      description: 'Collect customer-provided details while the experience is fresh.',
      icon: Clock,
    },
    {
      title: 'Build a Consistent Experience',
      description: 'Give customers a simple, branded flow.',
      icon: LayoutTemplate,
    },
    {
      title: 'Understand Customers',
      description: 'Use ratings, tags and private feedback to identify patterns.',
      icon: LineChart,
    },
    {
      title: 'Save Time',
      description: 'AI helps turn short customer input into a readable draft.',
      icon: Zap,
    },
    {
      title: 'Keep Customers in Control',
      description: 'Customers decide what they want to say and what they submit.',
      icon: UserCheck,
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            BUSINESS VALUE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Why businesses use ReviewAI
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Purpose-built tools to simplify customer feedback without compromising authenticity.
          </p>
        </div>

        {/* 6 Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{benefit.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{benefit.description}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
