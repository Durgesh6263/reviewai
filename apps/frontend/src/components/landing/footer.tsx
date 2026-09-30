import Link from 'next/link';
import { Sparkles, ShieldCheck } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="bg-slate-950 border-t border-slate-900 text-slate-400 py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          
          {/* Brand Info (2 Cols on md) */}
          <div className="col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-md">
                <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                </div>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">ReviewAI</span>
            </Link>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm leading-relaxed">
              ReviewAI is an AI-assisted customer review collection platform designed to help businesses make genuine customer feedback easier to express while keeping the customer in control.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400">
              <Sparkles className="w-3.5 h-3.5" />
              Customer-authored · AI-assisted
            </div>
            <div className="text-xs text-slate-500 pt-2">
              © {new Date().getFullYear()} ReviewAI. All rights reserved.
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Product</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#ai-assistant" className="hover:text-white transition-colors">
                  AI Review Assistant
                </a>
              </li>
              <li>
                <a href="#qr-system" className="hover:text-white transition-colors">
                  QR Reviews
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-white transition-colors">
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Trust */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Company & Trust</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <a href="#about" className="hover:text-white transition-colors">
                  About
                </a>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <a href="#trust-safety" className="hover:text-white transition-colors">
                  Customer Control
                </a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Account</h4>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Log In
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-white transition-colors">
                  Get Started
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar & Microcopy */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p className="max-w-2xl text-left">
            ReviewAI helps businesses collect and organize customer feedback. Customers remain responsible for reviewing, editing and submitting their own Google reviews.
          </p>
          <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Customer-authored · AI-assisted</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
