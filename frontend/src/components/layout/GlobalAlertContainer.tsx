import React from "react";
import { useAlerts, ALERT_STYLES } from "@/providers/AlertProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";

export function GlobalAlertContainer() {
    const { alerts, dismissAlert } = useAlerts();

    if (alerts.length === 0) return null;

    return (
        <div className="fixed top-20 inset-x-0 z-[100] pointer-events-none flex flex-col items-center gap-3 px-4">
            <AnimatePresence>
                {alerts.map((alert) => {
                    const style = ALERT_STYLES[alert.priority_level];
                    return (
                        <motion.div
                            key={alert.id}
                            initial={{ opacity: 0, y: -50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                            className={`w-full max-w-2xl pointer-events-auto relative rounded-2xl border-2 ${style.border} ${style.bg} p-4 shadow-2xl backdrop-blur-md`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-current opacity-20 blur-lg rounded-full animate-pulse" />
                                        <div className="relative h-12 w-12 rounded-2xl bg-foreground/10 flex items-center justify-center border border-foreground/20 shadow-inner">
                                            <Bell className="w-6 h-6 text-foreground animate-bounce" />
                                        </div>
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white dark:border-slate-900"></span>
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${style.border} ${style.bg} ${style.text}`}>
                                            EMERGENCY: {alert.priority_level}
                                        </span>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Critical Inbound</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-black text-foreground text-xl tracking-tighter truncate uppercase">
                                            {alert.patient_name}
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate font-bold uppercase tracking-wide opacity-80">
                                        {alert.symptoms || "Immediate intervention required"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => dismissAlert(alert.id)}
                                    className="shrink-0 p-3 rounded-2xl hover:bg-foreground/10 transition-colors border border-transparent hover:border-foreground/10"
                                    aria-label="Dismiss alert"
                                >
                                    <X className="w-5 h-5 opacity-50 hover:opacity-100" />
                                </button>
                            </div>
                            {/* Auto-dismiss progress bar */}
                            <motion.div
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: 15, ease: "linear" }}
                                className={`absolute bottom-0 left-2 right-2 h-1 rounded-full ${alert.priority_level === 'RED' ? 'bg-red-500' :
                                    alert.priority_level === 'ORANGE' ? 'bg-orange-500' : 'bg-yellow-500'
                                    } opacity-50`}
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
