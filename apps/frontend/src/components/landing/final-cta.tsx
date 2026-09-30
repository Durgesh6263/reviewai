import Link from 'next/link';
import { ArrowRight, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LandingFinalCTA() {
  return (
    <section className="py-20 md:py-28 bg-slate-950 relative overflow-hidden border-t border-slate-900">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[350px] bg-gradient-to-tr from-blue-600/20 via-indigo-600/15 to-violet-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="p-8 sm:p-12 md:p-16 rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 shadow-2xl text-center space-y-6">
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            Customer-authored · AI-assisted
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight max-w-3xl mx-auto leading-tight">
            Your customers already have something to say.{' '}
            <span className="block mt-2 font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 font-normal">
              Make it easier to say.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Give customers a simple way to share genuine experiences while giving your business better insight into what they value.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link href="/register">
              <Button
                size="lg"
                className="w-full sm:w-auto px-8 h-12 text-base font-semibold bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 hover:from-blue-500 hover:via-indigo-500 hover:to-amber-400 text-white rounded-xl shadow-xl shadow-blue-600/30 border border-white/10 group"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto px-7 h-12 text-base font-medium border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 rounded-xl"
              >
                Log In
              </Button>
            </Link>
          </div>

          {/* Micro trust row */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              No customer login required
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Customer remains in control
            </span>
          </div>

        </div>
      </div>
    </section>
  );
}
