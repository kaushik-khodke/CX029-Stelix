import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { TiltCard } from '@/components/ui/TiltCard'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Shield, Lock, Bot, Activity, Database, HeartPulse, ArrowRight } from 'lucide-react'

/* removed local TiltCard */

import { HeroSection } from '@/components/features/HeroSection'
import { BentoFeatures } from '@/components/features/BentoFeatures'

export function Landing() {
  const { t } = useTranslation()

  const steps = [
    { number: 1, text: t('landing.step_1', 'Sign up and verify your identity securely.') },
    { number: 2, text: t('landing.step_2', 'Upload existing records or connect providers.') },
    { number: 3, text: t('landing.step_3', 'Grant specific access to doctors when needed.') },
    { number: 4, text: t('landing.step_4', 'Receive AI-powered health alerts automatically.') },
  ]

  return (
    <div className="relative min-h-screen text-foreground overflow-hidden font-sans selection:bg-cyan-400/30 bg-slate-50">
      {/* SEAMLESS BACKGROUND VIDEO FOR ENTIRE PAGE */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-100"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
      />
      {/* Light overlay to wash out the dark video */}
      <div className="fixed inset-0 bg-white/50 z-0 pointer-events-none" />

      {/* Hero Section */}
      <HeroSection />

      {/* Bento Features Section */}
      <BentoFeatures />

      {/* Connected Steps */}
      <section id="how-it-works" className="py-24 sm:py-32 relative z-10 select-none">
        <div className="container mx-auto px-4 relative">
          <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 text-slate-900">
              How It{' '}
              <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">
                Works
              </span>
            </h2>
            <p className="text-lg sm:text-xl text-slate-600 font-light max-w-xl mx-auto">
              Your journey to decentralized healthcare in four simple steps.
            </p>
          </div>

          <div className="max-w-4xl mx-auto relative">
            {/* Liquid Background Trace Line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent -translate-x-1/2 hidden md:block" />

            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
                viewport={{ once: true, margin: "-100px" }}
                className={`flex items-center gap-8 md:gap-16 mb-12 sm:mb-20 ${index % 2 === 0 ? 'flex-row' : 'flex-row-reverse text-right'}`}
              >
                {/* Content Card */}
                <div className="flex-1">
                  <div className="liquid-glass rounded-[2rem] p-6 sm:p-10 transition-all duration-300 hover:bg-white/40 relative group">
                    <div className={`absolute -top-6 ${index % 2 === 0 ? '-right-4' : '-left-4'} text-7xl sm:text-[100px] font-black text-slate-900/5 font-heading transition-transform duration-500 group-hover:scale-110 pointer-events-none`}>
                      0{step.number}
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-3 text-slate-900 relative z-10 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-sm border border-cyan-200">
                        {step.number}
                      </span>
                      Step {step.number}
                    </h3>
                    <p className="text-slate-600 text-base sm:text-lg font-light leading-relaxed relative z-10">
                      {step.text}
                    </p>
                  </div>
                </div>

                {/* Center Node */}
                <div className="relative z-10 w-6 h-6 rounded-full liquid-glass border border-cyan-400 hidden md:flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  <div className="absolute inset-[-8px] rounded-full border border-cyan-400/50 animate-ping" />
                </div>

                {/* Empty flex-1 for alignment */}
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative z-10">
        <div className="container mx-auto px-4">
          <div className="liquid-glass rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden transition-all duration-500 hover:bg-white/40">
            <div className="absolute inset-0 bg-cyan-100/30 mix-blend-overlay" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-4xl md:text-6xl font-bold font-heading text-slate-900">
                Ready to Secure Your Health?
              </h2>
              <p className="text-xl text-slate-600 font-light">
                Join the decentralized healthcare revolution today.
              </p>
              <Link to="/signup">
                <Button size="lg" className="h-16 px-10 text-xl rounded-full bg-cyan-500 text-white hover:bg-cyan-600 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:scale-105 font-semibold mt-4">
                  Get Started Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white/60 backdrop-blur-xl pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2 text-cyan-600 font-bold text-xl">
                <Shield className="w-6 h-6" />
                Vibrant Wellness
              </div>
              <p className="text-slate-600 font-light max-w-sm">
                Empowering patients with secure, decentralized, and AI-driven healthcare management on the blockchain.
              </p>
            </div>
            <div>
              <h4 className="text-slate-900 font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-slate-600 font-light">
                <li><a href="#features" className="hover:text-cyan-600 transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-cyan-600 transition-colors">How It Works</a></li>
                <li><a href="#" className="hover:text-cyan-600 transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-900 font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-600 font-light">
                <li><a href="#" className="hover:text-cyan-600 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-cyan-600 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-cyan-600 transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 text-sm font-light">
            <p>&copy; {new Date().getFullYear()} Vibrant Wellness. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-cyan-600 transition-colors">Twitter</a>
              <a href="#" className="hover:text-cyan-600 transition-colors">Discord</a>
              <a href="#" className="hover:text-cyan-600 transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
