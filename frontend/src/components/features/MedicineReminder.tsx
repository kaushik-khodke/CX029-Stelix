import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Pill, CheckCircle2, X, Clock } from "lucide-react";

interface AgendaMedicine {
  time: string;
  name: string;
  note?: string;
  med_id?: string;
  item_id?: string;
}

export function MedicineReminder() {
  const { user, role } = useAuth();
  const [upcomingMeds, setUpcomingMeds] = useState<AgendaMedicine[]>([]);
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchTodayLogs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("medication_logs")
        .select("order_item_id, status")
        .eq("user_id", user.id)
        .eq("status", "taken")
        .gte("created_at", today.toISOString());

      if (error) throw error;
      setTakenIds(new Set(data.map((l: any) => l.order_item_id)));
    } catch (e) {
      console.error("Error fetching med logs for reminder:", e);
    }
  }, [user?.id]);

  const checkReminders = useCallback(() => {
    if (!user?.id || role !== "patient") return;

    const cacheKey = `daily_agenda_${user.id}`;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return;

    try {
      const { agenda } = JSON.parse(raw);
      if (!agenda || !agenda.medicines) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const due = agenda.medicines.filter((med: AgendaMedicine) => {
        if (!med.time || !med.item_id) return false;
        if (takenIds.has(med.item_id) || dismissedIds.has(med.item_id)) return false;

        const [hours, minutes] = med.time.split(":").map(Number);
        const medMinutes = hours * 60 + minutes;

        // One-hour span (60 mins before to 5 mins after, to catch it if they missed the exact start)
        const diff = medMinutes - currentMinutes;
        return diff >= -5 && diff <= 60;
      });

      setUpcomingMeds(due);
    } catch (e) {
      console.error("Error checking reminders:", e);
    }
  }, [user?.id, role, takenIds, dismissedIds]);

  useEffect(() => {
    if (user && role === "patient") {
      fetchTodayLogs();
      checkReminders();
      const interval = setInterval(checkReminders, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [user, role, fetchTodayLogs, checkReminders]);

  // Listen for global medication updates to refresh logs
  useEffect(() => {
    const handleUpdate = () => fetchTodayLogs();
    window.addEventListener("medication-updated", handleUpdate);
    return () => window.removeEventListener("medication-updated", handleUpdate);
  }, [fetchTodayLogs]);

  const handleTakeDose = async (med: AgendaMedicine) => {
    if (!user?.id || !med.med_id || !med.item_id) return;
    setLoading(true);
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
      const data = await res.json();
      if (data.success) {
        setTakenIds(prev => new Set(prev).add(med.item_id!));
        window.dispatchEvent(new CustomEvent("medication-updated"));
      }
    } catch (e) {
      console.error("Error logging dose from reminder:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = (itemId: string) => {
    setDismissedIds(prev => new Set(prev).add(itemId));
  };

  if (upcomingMeds.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {upcomingMeds.map((med) => (
          <motion.div
            key={med.item_id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            className="w-80 pointer-events-auto bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="bg-indigo-600 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">Due Soon ({med.time})</span>
              </div>
              <button 
                onClick={() => handleDismiss(med.item_id!)}
                className="text-white/70 hover:text-white transition-colors"
                disabled={loading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Pill className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {med.name}
                  </h4>
                  {med.note && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 italic italic">
                      "{med.note}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleTakeDose(med)}
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Taken
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
