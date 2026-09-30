import { UserCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export function LandingAbout() {
  return (
    <section id="about" className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-blue-600/10 blur-[130px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 tracking-wide uppercase">
            ABOUT REVIEWAI
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Reviews should come from the people who experienced your business.
          </h2>
        </div>

        <div className="rounded-2xl lg:rounded-3xl p-8 sm:p-12 bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800 shadow-2xl backdrop-blur-sm space-y-6 text-slate-300 text-base sm:text-lg leading-relaxed">
          <p>
            Many customers are happy with a business but struggle to write a review. ReviewAI simplifies that moment.
          </p>

          <p>
            A customer scans a business-specific QR code, gives a rating, selects the parts of their experience that mattered to them, and can add a short personal message.
          </p>

          <p>
            ReviewAI uses that customer-provided information to create an editable review draft.
          </p>

          <p>
            The customer reads it, changes anything they want, copies it, and manually continues to Google.
          </p>

          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-amber-300 font-medium text-base">
              The goal is simple: make genuine customer feedback easier to express without taking the customer&apos;s voice away.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              Customer-authored · AI-assisted
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
