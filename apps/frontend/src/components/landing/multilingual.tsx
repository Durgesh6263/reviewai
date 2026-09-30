import { Languages, CheckCircle2 } from 'lucide-react';

export function LandingMultilingual() {
  const supportedLanguages = [
    { name: 'English', desc: 'Natural phrasing and clear grammar for English-speaking customers.' },
    { name: 'Hindi', desc: 'Accurate Devanagari script generation and authentic phrasing.' },
    { name: 'Hinglish', desc: 'Casual, conversational romanized Hindi commonly used across India.' },
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-400 mb-4 uppercase tracking-wider">
            <Languages className="w-3.5 h-3.5" />
            MULTI-LANGUAGE EXPERIENCE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Meet customers in the language they are comfortable using.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            ReviewAI supports a multilingual customer experience so businesses can make the review journey easier for different audiences.
          </p>
        </div>

        {/* 3 Supported Languages Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {supportedLanguages.map((lang) => (
            <div
              key={lang.name}
              className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl flex flex-col justify-between hover:border-slate-700 hover:-translate-y-1 transition-all duration-300"
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <h3 className="text-xl font-bold text-white">{lang.name}</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{lang.desc}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Active in customer review flow</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
