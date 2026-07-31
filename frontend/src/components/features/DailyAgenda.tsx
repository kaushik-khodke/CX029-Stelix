import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE_URL } from "@/lib/api";
import {
  CalendarClock, Pill, Droplet, Footprints, CheckCircle2,
  RefreshCw, Sparkles, Lightbulb, AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface AgendaMedicine {
  time: string;
  name: string;
  note?: string;
  med_id?: string;
  item_id?: string;
}

interface DailyAgendaData {
  medicines: AgendaMedicine[];
  hydration_goal: number;
  steps_goal: number;
  daily_tip: string;
}

export function DailyAgenda() {
  const { user } = useAuth();
  const [agenda, setAgenda] = useState<DailyAgendaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneMeds, setDoneMeds] = useState<Set<string>>(new Set());
  const [hydrConsumed, setHydrConsumed] = useState(0);
  const [stepsLogged, setStepsLogged] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Load from cache only - don't auto-call API
    const cacheKey = `daily_agenda_${user.id}`;
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Cache valid for 24 hours
        if (Date.now() - parsed.timestamp < 86400000) {
          setAgenda(parsed.agenda);
        }
      } catch { }
    }
    
    // Initial progress fetch
    fetchCurrentProgress();

    // Listen for external updates (e.g. from LifestyleTracker)
    const handleEvents = () => {
      fetchCurrentProgress();
      fetchDoneMeds();
    };
    window.addEventListener('routine-updated', handleEvents);
    window.addEventListener('medication-updated', handleEvents);
    
    fetchDoneMeds();

    return () => {
      window.removeEventListener('routine-updated', handleEvents);
      window.removeEventListener('medication-updated', handleEvents);
    };
  }, [user]);

  const fetchDoneMeds = async () => {
    if (!user?.id) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('medication_logs')
        .select('order_item_id')
        .eq('user_id', user.id)
        .eq('status', 'taken')
        .gte('created_at', today.toISOString());

      if (error) throw error;
      setDoneMeds(new Set(data.map((l: any) => l.order_item_id)));
    } catch (e) {
      console.error("Error fetching done meds:", e);
    }
  };

  const fetchCurrentProgress = async () => {
    if (!user) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('health_routines')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_at', today.toISOString());

      if (error) throw error;

      let water = 0;
      let stepsCount = 0;

      data?.forEach(log => {
        if (log.metric_type === 'hydration') water += parseInt(log.value);
        if (log.metric_type === 'steps') stepsCount += parseInt(log.value);
      });

      setHydrConsumed(water);
      setStepsLogged(stepsCount);

    } catch (err) {
      console.error("Error fetching routine progress:", err);
    }
  };

  const logRoutineMetric = async (type: string, value: string, unit: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('health_routines').insert({
        user_id: user.id,
        metric_type: type,
        value: value,
        unit: unit
      });

      if (error) throw error;
      
      // Notify other components (e.g. LifestyleTracker)
      window.dispatchEvent(new CustomEvent('routine-updated'));
      
      // Update local state is handled by the event listener refetching
    } catch (err) {
      console.error("Error logging routine metric:", err);
    }
  };

  const generateAgenda = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/patient/daily-agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.success && data.agenda) {
        setAgenda(data.agenda);
        // Cache for 24 hours
        localStorage.setItem(
          `daily_agenda_${user.id}`,
          JSON.stringify({ agenda: data.agenda, timestamp: Date.now() })
        );
        setDoneMeds(new Set());
      } else {
        setError("Could not generate agenda. Please try again later.");
      }
    } catch (err) {
      setError("Backend unreachable. Check your connection.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Sort medicines chronologically
  const sortedMeds = (agenda?.medicines || []).slice().sort((a, b) =>
    a.time.localeCompare(b.time)
  );

  const hydrationPct = Math.min(
    (hydrConsumed / (agenda?.hydration_goal || 8)) * 100,
    100
  );
  const stepsPct = Math.min(
    (stepsLogged / (agenda?.steps_goal || 5000)) * 100,
    100
  );

  return (
    <Card className="glass-card rounded-2xl overflow-hidden border-border/50">
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
        <CardTitle className="flex items-center justify-between text-lg font-heading">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            AI Daily Agenda
          </div>
          <Button
            size="sm"
            variant={agenda ? "outline" : "default"}
            onClick={generateAgenda}
            disabled={loading}
            className="h-8 rounded-full text-xs gap-1.5 px-3"
          >
            {loading ? (
              <><RefreshCw className="w-3 h-3 animate-spin" /> Generating...</>
            ) : agenda ? (
              <><RefreshCw className="w-3 h-3" /> Regenerate</>
            ) : (
              <><Sparkles className="w-3 h-3" /> Generate My Agenda</>
            )}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Empty state */}
        {!agenda && !loading && (
          <div className="text-center py-12 px-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Your Personalized Day Plan</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-4">
              Click "Generate My Agenda" and our AI will build you a personalized daily schedule
              using your medications and health history.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-2 rounded-xl mx-auto max-w-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-3 bg-muted rounded" />
                <div className="w-8 h-8 rounded-full bg-muted" />
                <div className="flex-1 h-3 bg-muted rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Agenda content */}
        {agenda && !loading && (
          <div>
            {/* AI Tip */}
            <div className="flex items-start gap-3 p-4 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-800/30">
              <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                {agenda.daily_tip}
              </p>
            </div>

            {/* Medicine Timeline */}
            {sortedMeds.length > 0 && (
              <div className="px-4 pt-4 pb-2">
                <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5" /> Medicine Schedule
                </h5>
                <div className="space-y-1">
                  <AnimatePresence>
                    {sortedMeds.map((med, idx) => {
                      const id = med.item_id || `${med.time}-${med.name}-${idx}`;
                      const done = doneMeds.has(id);
                      return (
                        <motion.div
                          key={id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                            done
                              ? "bg-emerald-50/60 dark:bg-emerald-900/10"
                              : "bg-muted/30 hover:bg-muted/50"
                          }`}
                        >
                          <span className="text-xs font-bold text-muted-foreground w-12 shrink-0">
                            {med.time}
                          </span>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            done ? "bg-emerald-500/15" : "bg-indigo-500/10"
                          }`}>
                            {done
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : <Pill className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {med.name}
                            </p>
                            {med.note && (
                              <p className="text-xs text-muted-foreground">{med.note}</p>
                            )}
                          </div>
                          {!done && (
                            <button
                               onClick={async () => {
                                 if (!user?.id || !med.med_id || !med.item_id) {
                                   setDoneMeds(prev => new Set(prev).add(id));
                                   return;
                                 }
                                 try {
                                   const res = await fetch(`${API_BASE_URL}/log-dose`, {
                                     method: "POST",
                                     headers: { "Content-Type": "application/json" },
                                     body: JSON.stringify({
                                       user_id: user.id,
                                       medicine_id: med.med_id,
                                       order_item_id: med.item_id,
                                       status: "taken"
                                     }),
                                   });
                                   if (res.ok) {
                                     window.dispatchEvent(new CustomEvent("medication-updated"));
                                   }
                                 } catch (e) {
                                   console.error(e);
                                   setDoneMeds(prev => new Set(prev).add(id));
                                 }
                               }}
                               className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-full transition-colors font-medium shrink-0"
                             >
                               Mark Done
                             </button>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Goals Section */}
            <div className="px-4 pt-2 pb-4 space-y-4 mt-2">
              <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Today's Goals
              </h5>

              {/* Hydration Goal */}
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/80 dark:border-blue-800/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                    <Droplet className="w-4 h-4" />
                    Hydration Goal
                  </div>
                  <span className="text-sm font-bold text-blue-900 dark:text-blue-200">
                    {hydrConsumed} / {agenda.hydration_goal} glasses
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 h-2.5 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${hydrationPct}%` }}
                      transition={{ type: "spring", stiffness: 60 }}
                    />
                  </div>
                  <button
                    onClick={() => logRoutineMetric('hydration', '1', 'glasses')}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full font-medium transition-colors shrink-0"
                  >
                    +1 Glass
                  </button>
                </div>
              </div>

              {/* Steps Goal */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/80 dark:border-emerald-800/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                    <Footprints className="w-4 h-4" />
                    Steps Goal
                  </div>
                  <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    {stepsLogged.toLocaleString()} / {agenda.steps_goal.toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 h-2.5 bg-emerald-200 dark:bg-emerald-900 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${stepsPct}%` }}
                      transition={{ type: "spring", stiffness: 60 }}
                    />
                  </div>
                  <button
                    onClick={() => logRoutineMetric('steps', '500', 'steps')}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-full font-medium transition-colors shrink-0"
                  >
                    +500
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
