import { BotOff, Plus, Equal, Sparkles, CheckCircle2, ShieldCheck, HeartHandshake } from 'lucide-react';

export function LandingDifferentiation() {
  const formulaElements = [
    { title: 'Customer experience', desc: 'Real visit & service', color: 'from-blue-600/20 to-blue-900/30 text-blue-300 border-blue-500/30' },
    { title: 'Customer-selected tags', desc: '1–3 genuine highlights', color: 'from-indigo-600/20 to-indigo-900/30 text-indigo-300 border-indigo-500/30' },
    { title: "Customer's own words", desc: 'Personal thoughts or notes', color: 'from-violet-600/20 to-violet-900/30 text-violet-300 border-violet-500/30' },
    { title: 'AI assistance', desc: 'Natural phrasing & polish', color: 'from-amber-600/20 to-amber-900/30 text-amber-300 border-amber-500/30' },
  ];

  return (
    <section className="py-24 md:py-32 bg-slate-900/60 relative overflow-hidden border-t border-slate-900">
      {/* Background glowing sphere */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/10 blur-[130px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 mb-4 uppercase tracking-wider">
            <BotOff className="w-3.5 h-3.5" />
            GENUINE PARTICIPATION
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Not an auto-review bot.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
            ReviewAI is designed around customer participation. The platform does not ask an AI system to invent an experience and publish it automatically.
          </p>
        </div>

        {/* Visual Differentiation Formula Banner */}
        <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800 shadow-2xl">
          <div className="text-center mb-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              The ReviewAI Authorship Equation
            </span>
          </div>

          {/* Formula Pipeline */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-3 sm:gap-4">
            {formulaElements.map((item, idx) => (
              <div key={item.title} className="flex flex-col lg:flex-row items-center gap-3 w-full lg:w-auto">
                <div
                  className={`w-full lg:w-48 p-4 rounded-2xl bg-gradient-to-b ${item.color} border text-center shadow-lg hover:-translate-y-1 transition-all duration-300`}
                >
                  <span className="text-xs font-mono text-slate-400 block mb-1">Input 0{idx + 1}</span>
                  <h4 className="text-sm font-bold text-white mb-0.5">{item.title}</h4>
                  <p className="text-[11px] text-slate-300">{item.desc}</p>
                </div>
                {idx < formulaElements.length - 1 && (
                  <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Equal className="w-4 h-4" />
            </div>

            {/* Result Box */}
            <div
              className="w-full lg:w-56 p-5 rounded-2xl bg-gradient-to-b from-emerald-950/80 via-slate-900 to-slate-950 border-2 border-emerald-500/50 text-center shadow-xl shadow-emerald-950/40 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 uppercase tracking-wide mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Customer Approved
              </div>
              <h4 className="text-base font-extrabold text-white mb-1">
                Editable customer-approved draft
              </h4>
              <p className="text-[11px] text-slate-300">
                Customer copies & manually submits to Google
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Human-authored and customer-submitted. Zero simulated bot reviews.
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}
