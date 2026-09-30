import { MessageSquareText, ShieldAlert, Star, CheckCircle2 } from 'lucide-react';

export function LandingPrivateFeedback() {
  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <MessageSquareText className="w-3.5 h-3.5" />
            CONSTRUCTIVE INSIGHTS
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Learn from feedback that may never become a public review.
          </h2>
        </div>

        {/* Content Box */}
        <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800 shadow-2xl space-y-6 text-slate-300 text-base sm:text-lg leading-relaxed">
          <p>
            ReviewAI can collect private feedback from customers so businesses can understand what needs improvement.
          </p>

          <p>
            For lower ratings, businesses can invite customers to share additional private feedback.
          </p>

          <p>
            This feedback is intended to help the business understand customer experience and improve operations.
          </p>

          <div className="pt-6 border-t border-slate-800 flex items-start gap-3 bg-amber-950/20 border border-amber-900/30 p-4 rounded-xl">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-amber-200/90 font-medium">
              <strong className="text-amber-300">Important:</strong> Private feedback must not be presented as a reason to block the customer from accessing Google.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
