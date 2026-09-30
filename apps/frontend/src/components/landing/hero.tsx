'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  QrCode,
  Star,
  CheckCircle2,
  Copy,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LandingHero() {
  // Interactive mockup demo state
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Clean Environment', 'Friendly Staff']);
  const [customerNotes, setCustomerNotes] = useState<string>('Great workout atmosphere, super helpful trainers!');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const sampleTags = ['Friendly Staff', 'Clean Space', 'Fast Service', 'Quality Product', 'Great Ambience'];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length < 3) setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleCopyDemo = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden bg-slate-950 text-white">
      {/* Background ambient glowing mesh gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] md:w-[1000px] md:h-[600px] bg-gradient-to-b from-blue-600/20 via-indigo-600/15 to-transparent blur-3xl opacity-70"
          style={{ willChange: 'transform' }}
        />
        <div className="absolute top-1/3 -left-32 w-80 h-80 bg-violet-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl" />
        {/* Subtle geometric dot grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0f_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0f_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Badge: "Customer-Controlled · AI-Assisted" */}
        <div className="flex justify-center animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/30 text-xs text-slate-300 shadow-xl shadow-amber-950/30 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-amber-400" />
            <span className="font-semibold text-amber-400">Customer-Controlled · AI-Assisted</span>
          </div>
        </div>

        {/* Hero Title & Subheadline */}
        <div className="text-center max-w-4xl mx-auto mt-6 space-y-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] animate-in fade-in duration-700">
            Turn real customer experiences into{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 font-serif italic font-normal">
              better Google reviews.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed animate-in fade-in duration-700 delay-100">
            ReviewAI makes it easier for customers to share what they actually experienced. Customers scan your QR code, rate their experience, choose what stood out, and optionally add their own words. AI then helps turn that input into a natural, editable review draft.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2 animate-in fade-in duration-700 delay-200">
            <Link href="/register" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto px-8 h-12 text-base font-semibold bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 hover:from-blue-500 hover:via-indigo-500 hover:to-amber-400 text-white rounded-xl shadow-xl shadow-blue-600/25 border border-white/10 group"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="#how-it-works" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto px-7 h-12 text-base font-medium border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-slate-200 rounded-xl backdrop-blur-md"
              >
                See How It Works
              </Button>
            </a>
          </div>

          {/* Small Supporting Text */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              No customer login required
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Customer remains in control
            </span>
          </div>
        </div>

        {/* Interactive Animated Product Mockup Flow */}
        <div className="mt-14 lg:mt-20 max-w-5xl mx-auto animate-in fade-in duration-700 delay-300">
          {/* Mockup Outer Frame */}
          <div className="relative rounded-2xl md:rounded-3xl p-1.5 md:p-2.5 bg-gradient-to-b from-slate-700/60 via-slate-850 to-slate-900 shadow-2xl shadow-black/80 border border-slate-800">
            <div className="bg-slate-950/95 rounded-[18px] md:rounded-[22px] overflow-hidden border border-slate-800/90">
              
              {/* Window Chrome Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-xs text-slate-400 font-mono hidden sm:inline">
                    https://reviewai.com/r/the-fitness-world
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-amber-400 bg-amber-950/50 border border-amber-800/50 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Interactive ReviewAI Flow
                  </span>
                </div>
              </div>

              {/* Interactive Flow Grid */}
              <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
                
                {/* Left Side: QR Stand (4 Cols) */}
                <div className="lg:col-span-4 flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-inner relative overflow-hidden group">
                  <div className="absolute top-2 right-2 text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full">
                    Step 01
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">Unique Business QR</h4>
                  <p className="text-xs text-slate-400 text-center mb-4">Customer scans with native phone camera.</p>
                  
                  {/* QR Card with laser beam scan effect */}
                  <div className="relative w-44 h-44 bg-white rounded-2xl p-3 shadow-2xl flex items-center justify-center border-2 border-amber-500/40">
                    <img
                      src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://reviewai.com/r/the-fitness-world&color=0F172A&bgcolor=FFFFFF"
                      alt="Scan ReviewAI Demo QR Code"
                      width={140}
                      height={140}
                      className="w-full h-full object-contain"
                    />
                    <div
                      className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#fbbf24] animate-scan-laser"
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-300 font-medium">
                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>Table Stand QR • The Fitness World</span>
                  </div>
                </div>

                {/* Right Side: Customer Experience & AI Review Flow (8 Cols) */}
                <div className="lg:col-span-8 space-y-4">
                  
                  {/* Step Tracker Chips */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs text-slate-400 border-b border-slate-800">
                    <span className="flex items-center gap-1 font-semibold text-blue-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 1. Scan QR
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="flex items-center gap-1 font-semibold text-indigo-400">
                      <Star className="w-3.5 h-3.5 fill-indigo-400" /> 2. Rate & Choose Tags
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="flex items-center gap-1 font-semibold text-amber-400">
                      <Sparkles className="w-3.5 h-3.5" /> 3. AI Assists Draft
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <ExternalLink className="w-3.5 h-3.5" /> 4. Continue to Google
                    </span>
                  </div>

                  {/* 1. Rating Selector in Mockup */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-300">Customer Rating</span>
                      <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                        5.0 — Excellent experience
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setSelectedRating(star)}
                          className={`p-1.5 rounded-lg transition-transform hover:scale-110 ${
                            star <= selectedRating ? 'text-amber-400' : 'text-slate-700'
                          }`}
                        >
                          <Star className="w-6 h-6 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Highlight Tags in Mockup */}
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                    <span className="text-xs font-medium text-slate-300 block mb-2">
                      Experience Highlights (Customer picks what stood out)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {sampleTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm shadow-amber-500/30'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. AI Generated Review Preview with Editing */}
                  <div className="bg-gradient-to-b from-slate-900/90 to-slate-950 rounded-xl p-4 border border-amber-500/30 shadow-lg relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-md bg-amber-500/20 text-amber-400">
                          <Sparkles className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs font-semibold text-white">AI-Assisted Review Draft</span>
                        <span className="text-[10px] text-amber-300 bg-amber-950 border border-amber-800/40 px-2 py-0.5 rounded-full">
                          Customer-editable
                        </span>
                      </div>
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    </div>

                    <p className="text-sm text-slate-200 leading-relaxed font-sans bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                      "I had a great experience at The Fitness World. The clean space and friendly staff made a big difference. Highly recommended!"
                    </p>

                    {/* Action Bar inside review preview */}
                    <div className="mt-3 flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Customer stays in control before posting
                      </span>
                      <Button
                        size="sm"
                        onClick={handleCopyDemo}
                        className={`h-8 text-xs font-semibold transition-all ${
                          isCopied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Copied! Opening Google...
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            Copy & Continue to Google
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
