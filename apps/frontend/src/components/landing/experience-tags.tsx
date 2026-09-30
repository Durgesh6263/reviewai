import { Tag, Sparkles, Check } from 'lucide-react';

export function LandingExperienceTags() {
  const exampleTags = [
    'Fast Service',
    'Friendly Staff',
    'Clean Space',
    'Good Pricing',
    'Quality Product',
    'Professional Service',
    'Helpful Team',
    'On-Time Delivery',
    'Great Ambience',
    'Easy Experience',
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400 mb-4 uppercase tracking-wider">
            <Tag className="w-3.5 h-3.5" />
            CUSTOMIZABLE EXPERIENCE TAGS
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Give customers an easier way to describe what stood out.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Businesses can configure short experience tags that reflect the things customers commonly value.
          </p>
        </div>

        {/* Tags Display */}
        <div className="rounded-2xl p-8 sm:p-12 bg-slate-900/60 border border-slate-800 shadow-2xl">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-6 text-center">
            Example Tags Configured by Businesses
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {exampleTags.map((tag) => (
              <div
                key={tag}
                className="px-4 py-2.5 rounded-full bg-slate-800/90 border border-slate-700/80 hover:border-amber-500/50 hover:scale-105 text-slate-200 hover:text-white text-sm font-medium flex items-center gap-2 shadow-sm transition-all duration-200"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {tag}
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-xs sm:text-sm text-slate-400">
              <strong className="text-slate-300">Important:</strong> These are examples only. Businesses can customize their own tags.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
