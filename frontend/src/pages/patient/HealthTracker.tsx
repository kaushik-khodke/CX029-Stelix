import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Sparkles, Activity } from "lucide-react";
import { DailyAgenda } from "@/components/features/DailyAgenda";
import { LifestyleTracker } from "@/components/features/LifestyleTracker";
import { SmartHealthInsights } from "@/components/features/SmartHealthInsights";
import { AdherenceReport } from "@/components/features/AdherenceReport";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 },
};

export default function HealthTracker() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.03]" />
      <div className="absolute top-0 left-0 w-[40%] h-[50%] rounded-full bg-emerald-400/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[60%] rounded-full bg-indigo-500/10 blur-3xl -z-10" />
      <div className="absolute inset-0 -z-10 mask-radial-faded bg-background/40 backdrop-blur-[1px]" />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 relative">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-4">
            <Activity className="h-4 w-4" />
            My Daily Routines
          </div>
          <h1 className="text-3xl md:text-4xl font-bold font-heading tracking-tight text-foreground mb-2">
            Health & Routine Tracker
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Monitor your vital stats, stay hydrated, and follow your health agenda closely.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          {/* Left Column: AI insights and Vitals */}
          <div className="lg:col-span-7 space-y-6">
            <motion.div variants={item}>
              <SmartHealthInsights />
            </motion.div>
            <motion.div variants={item}>
              <LifestyleTracker />
            </motion.div>
          </div>

          {/* Right Column: Timeline Agenda */}
          <div className="lg:col-span-5 space-y-6">
            <motion.div variants={item}>
              <DailyAgenda />
            </motion.div>
          </div>
        </motion.div>

        {/* Medication Adherence Section */}
        <motion.div variants={item} initial="hidden" animate="show" className="mt-12">
            <AdherenceReport />
        </motion.div>
      </div>
    </div>
  );
}
