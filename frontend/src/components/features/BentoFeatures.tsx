import React from 'react';
import { Database, Lock, Bot, QrCode, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function BentoFeatures() {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-24 sm:py-32 relative z-10 text-slate-900 select-none">
      {/* Background glow highlights matching Hero section */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-blue-300/30 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-cyan-300/30 blur-[120px] pointer-events-none rounded-full" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="liquid-glass rounded-full inline-flex items-center gap-2 px-4 py-1.5 mb-4">
            <ShieldCheck className="w-4 h-4 text-cyan-600" />
            <span className="text-xs font-medium tracking-wide uppercase text-slate-600">
              Web3 & AI Healthcare Architecture
            </span>
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 text-slate-900">
            Engineered for{' '}
            <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
              Trust
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-600 font-light max-w-xl mx-auto">
            Web3 security meets AI intelligence for instant, patient-controlled health management.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 max-w-6xl mx-auto">
          
          {/* Bento Card 1: Smart Health Cards (Lg: 7 cols) */}
          <div className="lg:col-span-7 liquid-glass rounded-[2.5rem] p-8 sm:p-10 flex flex-col justify-between transition-all duration-300 hover:bg-white/40">
            <div>
              <div className="h-12 w-12 rounded-2xl liquid-glass flex items-center justify-center text-cyan-600 mb-6 border border-cyan-200 shadow-sm">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900 mb-3 tracking-tight">
                {t('landing.feature_1_title', 'Smart Health Cards')}
              </h3>
              <p className="text-slate-600 text-base sm:text-lg font-light leading-relaxed max-w-md">
                {t('landing.feature_1_desc', 'Instant access with QR codes. No passwords, just scan and go.')}
              </p>
            </div>

            {/* Bento Inner Visual Element */}
            <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600 font-mono text-xs font-bold border border-cyan-200">
                  QR
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-mono">HEALTH CARD ID</div>
                  <div className="text-sm font-semibold text-slate-900 font-mono">MHC-8849-X</div>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-600 liquid-glass rounded-full px-3.5 py-1.5 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified Patient Key
              </div>
            </div>
          </div>

          {/* Bento Card 2: Blockchain Security (Lg: 5 cols) */}
          <div className="lg:col-span-5 liquid-glass rounded-[2.5rem] p-8 sm:p-10 flex flex-col justify-between transition-all duration-300 hover:bg-white/40">
            <div>
              <div className="h-12 w-12 rounded-2xl liquid-glass flex items-center justify-center text-blue-600 mb-6 border border-blue-200 shadow-sm">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900 mb-3 tracking-tight">
                {t('landing.feature_2_title', 'Blockchain Security')}
              </h3>
              <p className="text-slate-600 text-base sm:text-lg font-light leading-relaxed">
                {t('landing.feature_2_desc', 'Your data encrypted and stored across IPFS with immutable blockchain verification.')}
              </p>
            </div>

            {/* Bento Inner Visual Element */}
            <div className="mt-8 pt-6 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>ENCRYPTION</span>
                <span className="text-cyan-600 font-semibold">AES-256 GCM</span>
              </div>
              <div className="liquid-glass rounded-xl p-2.5 text-[11px] font-mono text-slate-600 truncate border border-slate-200">
                ipfs://bafybeic7x3...89fd4
              </div>
            </div>
          </div>

          {/* Bento Card 3: AI Health Assistant (Lg: 12 cols - Full width banner bento) */}
          <div className="lg:col-span-12 liquid-glass rounded-[2.5rem] p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 transition-all duration-300 hover:bg-white/40">
            <div className="max-w-xl">
              <div className="h-12 w-12 rounded-2xl liquid-glass flex items-center justify-center text-teal-600 mb-6 border border-teal-200 shadow-sm">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900 mb-3 tracking-tight flex items-center gap-3">
                {t('landing.feature_3_title', 'AI Health Assistant')}
                <span className="liquid-glass rounded-full px-3 py-1 text-xs font-medium text-teal-700 border border-teal-200">
                  Real-time Diagnostics
                </span>
              </h3>
              <p className="text-slate-600 text-base sm:text-lg font-light leading-relaxed">
                {t('landing.feature_3_desc', 'Get instant answers about your health with voice and text support, automated risk alerts, and personalized clinical insights.')}
              </p>
            </div>

            {/* Bento Inner Visual Element */}
            <div className="w-full md:w-auto min-w-[280px] liquid-glass rounded-2xl p-5 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-medium text-slate-900">AI Clinical Engine</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-xs text-slate-600 font-medium bg-white/50 p-3 rounded-xl border border-slate-200">
                "All health markers normal. No adverse drug interactions found."
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
