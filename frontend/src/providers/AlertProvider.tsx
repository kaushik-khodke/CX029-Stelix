import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type PriorityLevel = "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE";

export interface TriageAlert {
    id: string;
    patient_name: string;
    priority_level: PriorityLevel;
    symptoms: string;
    timestamp: number;
}

interface AlertContextType {
    alerts: TriageAlert[];
    dismissAlert: (id: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const ALERT_PRIORITIES: PriorityLevel[] = ["RED", "ORANGE", "YELLOW"];

export const ALERT_STYLES: Record<string, { bg: string, border: string, text: string, icon: string, label: string }> = {
    RED: { bg: "bg-red-500/10", border: "border-red-500", text: "text-red-500", icon: "🚨", label: "Immediate (Level 1)" },
    ORANGE: { bg: "bg-orange-500/10", border: "border-orange-500", text: "text-orange-500", icon: "⚠️", label: "Very Urgent (Level 2)" },
    YELLOW: { bg: "bg-yellow-500/10", border: "border-yellow-500", text: "text-yellow-500", icon: "⏳", label: "Urgent (Level 3)" },
};

export function AlertProvider({ children }: { children: ReactNode }) {
    const { user, role } = useAuth();
    const [alerts, setAlerts] = useState<TriageAlert[]>([]);

    const dismissAlert = (id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    useEffect(() => {
        console.log("AlertProvider initialized for user:", user?.id, "role:", role);

        const channel = supabase
            .channel("global_triage_alerts")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "triage_queue" },
                (payload) => {
                    console.log("Realtime triage_queue change:", payload);
                    const newPatient = payload.new as any;

                    // On DELETE, payload.new is empty.
                    if (!newPatient || !newPatient.priority_level) return;

                    // Only trigger for waiting patients (not when they are being treated)
                    if (newPatient.status !== "waiting") return;

                    if (ALERT_PRIORITIES.includes(newPatient.priority_level)) {
                        const alert: TriageAlert = {
                            id: newPatient.id,
                            patient_name: newPatient.patient_name,
                            priority_level: newPatient.priority_level,
                            symptoms: newPatient.symptoms || "",
                            timestamp: Date.now(),
                        };
                        setAlerts(prev => {
                            // Avoid duplicates if it's an UPDATE that doesn't change priority
                            if (prev.some(a => a.id === alert.id)) return prev;
                            return [alert, ...prev];
                        });

                        // Auto-dismiss after 15 seconds
                        setTimeout(() => {
                            setAlerts(prev => prev.filter(a => a.id !== alert.id));
                        }, 15000);
                    }
                }
            )
            .subscribe((status) => {
                console.log("Supabase Realtime subscription status:", status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, role]);

    return (
        <AlertContext.Provider value={{ alerts, dismissAlert }}>
            {children}
        </AlertContext.Provider>
    );
}

export function useAlerts() {
    const context = useContext(AlertContext);
    if (context === undefined) {
        throw new Error("useAlerts must be used within an AlertProvider");
    }
    return context;
}
