import React, { useState } from 'react';
import { CircleUserRound, Menu, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function HeroSection() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <section id="home" className="relative z-10 w-full h-screen min-h-[600px] overflow-hidden flex flex-col justify-between select-none">
      {/* NAVIGATION (z-20, top) */}
      <nav className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
        {/* Left: Brand Logo & Title */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 md:w-[36px] md:h-[36px] rounded-xl bg-cyan-100 backdrop-blur-md flex items-center justify-center border border-cyan-200 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-cyan-600" />
          </div>
          <span className="text-slate-900 font-bold text-xl tracking-tight">
            MyHealthChain
          </span>
        </Link>

        {/* Center (Desktop only): Liquid Glass Pill */}
        <div className="hidden md:flex items-center gap-8 px-8 py-3 rounded-full liquid-glass">
          <a href="#home" className="text-slate-900 text-sm font-medium transition-opacity hover:opacity-80">
            Home
          </a>
          <a href="#features" className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-opacity">
            Features
          </a>
          <a href="#how-it-works" className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-opacity">
            How It Works
          </a>
        </div>

        {/* Right (Desktop only): Liquid Glass Circle with User Icon */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="h-10 w-10 rounded-full liquid-glass flex items-center justify-center transition-transform hover:scale-105"
            title="Portal Login"
          >
            <CircleUserRound className="h-5 w-5 text-slate-700" strokeWidth={1.5} />
          </Link>
        </div>

        {/* Right (Mobile only, md:hidden): Liquid Glass Circle Button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden relative h-10 w-10 rounded-full liquid-glass z-50 flex items-center justify-center focus:outline-none"
          aria-label="Toggle Menu"
        >
          <Menu
            className={`absolute h-5 w-5 text-slate-900 transition-all duration-300 ${
              menuOpen ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
          <X
            className={`absolute h-5 w-5 text-slate-900 transition-all duration-300 ${
              menuOpen ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
            }`}
          />
        </button>
      </nav>

      {/* MOBILE MENU OVERLAY (z-10, fixed inset-0, md:hidden) */}
      <div
        className={`fixed inset-0 z-10 md:hidden bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500 ease-out ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`flex flex-col items-center gap-8 transition-transform duration-500 ease-out ${
            menuOpen ? 'translate-y-0' : '-translate-y-8'
          }`}
        >
          <a
            href="#home"
            onClick={() => setMenuOpen(false)}
            className="text-2xl font-medium text-slate-900 hover:opacity-80 transition-opacity"
          >
            Home
          </a>
          <a
            href="#features"
            onClick={() => setMenuOpen(false)}
            className="text-2xl font-medium text-slate-900 hover:opacity-80 transition-opacity"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMenuOpen(false)}
            className="text-2xl font-medium text-slate-900 hover:opacity-80 transition-opacity"
          >
            How It Works
          </a>

          <div className="mt-4 flex items-center gap-3">
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="h-10 w-10 rounded-full liquid-glass flex items-center justify-center"
            >
              <CircleUserRound className="h-5 w-5 text-slate-700" strokeWidth={1.5} />
            </Link>
            <span className="text-sm font-light text-slate-600">Portal Login</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT (z-10) */}
      <div
        className={`relative z-10 flex-1 flex flex-col justify-between px-5 pb-8 sm:px-8 sm:pb-12 md:px-16 lg:px-20 transition-opacity duration-300 ${
          menuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Top block */}
        <div className="mt-14 sm:mt-20 md:mt-24 max-w-3xl">
          {/* Badge */}
          <div className="liquid-glass rounded-full inline-flex items-center gap-2.5 sm:gap-3 px-3.5 py-1.5 sm:px-4.5 sm:py-2 mb-5 sm:mb-6">
            <div className="flex -space-x-2">
              <img
                src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100"
                alt="Patient 1"
                className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white object-cover"
              />
              <img
                src="https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100"
                alt="Doctor 1"
                className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white object-cover"
              />
              <img
                src="https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100"
                alt="Patient 2"
                className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white object-cover"
              />
              <img
                src="https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=100"
                alt="Doctor 2"
                className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white object-cover"
              />
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800">
              Web3 & AI Integrated Health Network
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] text-slate-900 tracking-[-0.04em]">
            Your Health Records,
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
              Secured by Blockchain.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-4 sm:mt-5 text-base sm:text-lg md:text-xl font-light text-slate-600 max-w-2xl leading-relaxed">
            {t('landing.hero_subtitle', 'Store, manage, and share medical records securely with Smart Health Cards, AI diagnostics, and patient-owned encryption.')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center gap-4 mt-6 sm:mt-8">
            <Link to="/signup?role=patient">
              <button className="rounded-full px-6 py-3.5 sm:px-8 sm:py-4 text-sm sm:text-base font-semibold text-white bg-cyan-500 transition duration-300 hover:bg-cyan-600 hover:scale-105 flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <span>{t('landing.cta_patient', 'Patient Portal')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>

            <Link to="/signup?role=doctor">
              <button className="liquid-glass rounded-full px-6 py-3.5 sm:px-7 sm:py-4 text-sm sm:text-base font-medium text-slate-700 transition duration-300 hover:bg-white/40 hover:text-slate-900 flex items-center justify-center gap-2 cursor-pointer border border-cyan-100">
                <span>{t('landing.cta_doctor', "Doctor Portal")}</span>
              </button>
            </Link>
          </div>
        </div>

        {/* BOTTOM STATS */}
        <div className="flex flex-wrap items-end gap-6 sm:gap-12 md:gap-16 pb-4 sm:pb-8 pt-6">
          {/* Stat 1 */}
          <div className="flex flex-col">
            <div className="relative w-5 h-5 mb-2">
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '2px', left: '8.75px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '8.75px', left: '4px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '8.75px', left: '8.75px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '8.75px', left: '13.5px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '15px', left: '0px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '15px', left: '4.3px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '15px', left: '8.75px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '15px', left: '13.2px' }} />
              <span className="absolute w-[2.5px] h-[2.5px] bg-cyan-500 rounded-full" style={{ top: '15px', left: '17.5px' }} />
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
              256-bit
            </div>
            <div className="text-xs sm:text-sm font-light text-slate-500">
              AES-256 Encryption
            </div>
          </div>

          {/* Stat 2 */}
          <div className="flex flex-col">
            <div className="grid grid-cols-3 gap-[2px] w-5 h-5 mb-2">
              <div className="w-1 h-1 rounded-sm bg-cyan-500" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500/0" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500/0" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500/0" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500/0" />
              <div className="w-1 h-1 rounded-sm bg-cyan-500" />
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
              0%
            </div>
            <div className="text-xs sm:text-sm font-light text-slate-500">
              Data Leaks & Breaches
            </div>
          </div>

          {/* Stat 3 */}
          <div className="flex flex-col">
            <div className="w-5 h-5 mb-2 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
              Instant
            </div>
            <div className="text-xs sm:text-sm font-light text-slate-500">
              Smart QR Access
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
