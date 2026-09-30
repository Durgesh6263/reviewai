import { FileEdit, Clock, MessageSquareX, SlidersHorizontal, ArrowDown } from 'lucide-react';

export function LandingProblem() {
  const problems = [
    {
      num: '01',
      title: 'Blank Page Problem',
      description: 'Customers may want to leave feedback but do not know what to write.',
      icon: FileEdit,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      num: '02',
      title: 'Slow Review Collection',
      description: 'Businesses often depend on customers remembering to review them later.',
      icon: Clock,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
    {
      num: '03',
      title: 'Generic Feedback',
      description: "Short feedback can miss the details that made the customer's experience meaningful.",
      icon: MessageSquareX,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      num: '04',
      title: 'Too Much Friction',
      description: 'Every additional step can reduce the chance that a customer finishes the process.',
      icon: SlidersHorizontal,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 mb-4 uppercase tracking-wider">
            THE CHALLENGE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Customers have the experience. Writing the review is the hard part.
          </h2>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {problems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.num}
                className="rounded-2xl p-6 bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl font-mono font-black text-slate-700 group-hover:text-slate-500 transition-colors">
                      {item.num}
                    </span>
                    <div className={`p-2 rounded-xl border ${item.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Closing statement */}
        <div className="mt-12 text-center">
          <div className="inline-block p-4 px-6 rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/20 shadow-xl">
            <p className="text-base sm:text-lg font-medium text-slate-200">
              ReviewAI reduces the friction while keeping the customer&apos;s experience at the center.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
