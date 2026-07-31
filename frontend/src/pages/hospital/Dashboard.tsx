import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader2, Plus, AlertCircle, Clock, Activity, ScanLine, Users, AlertTriangle, Timer, CheckCircle, X, Bell, TrendingUp, BedDouble } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TriageAssessmentModal } from "@/pages/hospital/TriageAssessmentModal";
import { ResourceLoadBalancer } from "@/pages/hospital/ResourceLoadBalancer";

export type PriorityLevel = "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE";

export interface TriagePatient {
    id: string;
    patient_name: string;
    patient_id?: string;
    arrival_time: string;
    vitals: {
        hr: string;
        bp: string;
        spo2: string;
        temp: string;
    };
    symptoms: string;
    priority_level: PriorityLevel;
    ai_confidence: number;
    ai_reasoning: string;
    status: string;
}

const PRIORITY_ORDER: Record<PriorityLevel, number> = {
    RED: 1,
    ORANGE: 2,
    YELLOW: 3,
    GREEN: 4,
    BLUE: 5,
};

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
    RED: "bg-red-500/10 text-red-500 border-red-500/20",
    ORANGE: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    YELLOW: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    GREEN: "bg-green-500/10 text-green-500 border-green-500/20",
    BLUE: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

// Triage Alert types are now managed in AlertProvider.tsx

export default function HospitalDashboard({ defaultTab = 'queue' }: { defaultTab?: 'queue' | 'resources' }) {
    const navigate = useNavigate();
    const [queue, setQueue] = useState<TriagePatient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<'queue' | 'resources'>(defaultTab);
    
    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab]);
    
    // Assign Bed Bridge State
    const [availableBeds, setAvailableBeds] = useState<any[]>([]);
    const [isBedModalOpen, setIsBedModalOpen] = useState(false);
    const [patientToAssignBed, setPatientToAssignBed] = useState<TriagePatient | null>(null);
    const [selectedBedId, setSelectedBedId] = useState("");

    const openBedModal = async (patient: TriagePatient) => {
        setPatientToAssignBed(patient);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds/${userData.user.id}`);
            if (res.ok) {
                const beds = await res.json();
                setAvailableBeds(beds.filter((b: any) => b.status === "available"));
            }
        } catch (e) {
            console.error(e);
        }
        setIsBedModalOpen(true);
    };

    const confirmAssignBed = async () => {
        if (!patientToAssignBed || !selectedBedId) return;
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
        try {
            await fetch(`${BACKEND_URL}/resource/beds/${selectedBedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "occupied",
                    patient_id: patientToAssignBed.patient_id,
                    triage_id: patientToAssignBed.id,
                    priority_assigned: patientToAssignBed.priority_level
                })
            });
            await markAttended(patientToAssignBed.id);
            setIsBedModalOpen(false);
            setPatientToAssignBed(null);
            setSelectedBedId("");
        } catch (e) {
            console.error(e);
        }
    };

    const fetchQueue = async () => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return;

            const { data, error } = await supabase
                .from("triage_queue")
                .select("*")
                .eq("hospital_id", userData.user.id)
                .eq("status", "waiting")
                .order("arrival_time", { ascending: true });

            if (error) throw error;

            // Sort in JS to ensure Priority overrides Arrival Time
            const sorted = (data || []).sort((a, b) => {
                const pA = PRIORITY_ORDER[a.priority_level as PriorityLevel] || 6;
                const pB = PRIORITY_ORDER[b.priority_level as PriorityLevel] || 6;
                if (pA !== pB) return pA - pB;
                return new Date(a.arrival_time).getTime() - new Date(b.arrival_time).getTime();
            });

            setQueue(sorted as TriagePatient[]);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to load triage queue");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();

        const channel = supabase
            .channel("triage_queue_changes")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "triage_queue" },
                (payload) => {
                    // Global alerts are now handled by AlertProvider. 
                    // We just need to refresh the queue here.
                    fetchQueue();
                }
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "triage_queue" },
                () => { fetchQueue(); }
            )
            .on(
                "postgres_changes",
                { event: "DELETE", schema: "public", table: "triage_queue" },
                () => { fetchQueue(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const formatWaitTime = (arrivalTime: string) => {
        const diff = Date.now() - new Date(arrivalTime).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    const getLoadIndex = () => {
        if (queue.length === 0) return "Low";
        if (queue.length < 5) return "Moderate";
        return "Peak";
    };

    const criticalPatientsCount = queue.filter(p => p.priority_level === 'RED' || p.priority_level === 'ORANGE').length;

    const markAttended = async (patientId: string) => {
        try {
            const { error } = await supabase
                .from("triage_queue")
                .update({ status: "in_treatment" })
                .eq("id", patientId);

            if (error) throw error;
            // Optimistically remove from local state for instant UI feedback
            setQueue(prev => prev.filter(p => p.id !== patientId));
        } catch (err: any) {
            console.error("Failed to mark patient as attended:", err);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-foreground">
                            Hospital Portal
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Emergency & Resource Management
                        </p>
                    </div>
                </div>
                {activeTab === 'queue' && (
                    <Button
                        onClick={() => setIsModalOpen(true)}
                        className="gradient-primary gap-2 h-11 px-6 shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-5 h-5" />
                        New Triage Assessment
                    </Button>
                )}
            </div>

            {activeTab === 'resources' ? (
                <ResourceLoadBalancer />
            ) : (
                <>
                    {/* Quick Stats Row */}
            {!isLoading && !error && (
                <div className="flex flex-col md:flex-row gap-6">
                    <Card className="flex-1 glass-card border-l-4 border-l-primary/50 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5">
                            <Users className="w-16 h-16" />
                        </div>
                        <CardContent className="p-6 flex items-center gap-4 relative z-10">
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 group-hover:bg-primary/20 transition-colors">
                                <Users className="w-7 h-7 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">Total in Queue</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-bold tracking-tighter">{queue.length}</h3>
                                    <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">Active</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="flex-1 glass-card border-l-4 border-l-orange-500/50 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5">
                            <AlertTriangle className="w-16 h-16" />
                        </div>
                        <CardContent className="p-6 flex items-center gap-4 relative z-10">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${criticalPatientsCount > 0 ? 'bg-orange-500/20 border-orange-500/30 animate-pulse' : 'bg-orange-500/10 border-orange-500/20'}`}>
                                <AlertTriangle className="w-7 h-7 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">Critical / High Risk</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className={`text-3xl font-bold tracking-tighter ${criticalPatientsCount > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                                        {criticalPatientsCount}
                                    </h3>
                                    {criticalPatientsCount > 0 && (
                                        <span className="text-[10px] font-bold text-orange-600 px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">Attention Required</span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="flex-1 glass-card border-l-4 border-l-indigo-500/50 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5">
                            <TrendingUp className="w-16 h-16" />
                        </div>
                        <CardContent className="p-6 flex items-center gap-4 relative z-10">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
                                <TrendingUp className="w-7 h-7 text-indigo-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/70">System Load Index</p>
                                <h3 className="text-3xl font-bold tracking-tighter">{getLoadIndex()}</h3>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {error ? (
                <Card className="border-destructive/50 bg-destructive/10">
                    <CardContent className="p-6 text-destructive flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error}</p>
                    </CardContent>
                </Card>
            ) : isLoading ? (
                <div className="grid gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-44 rounded-2xl bg-muted/20 border border-border/50 overflow-hidden relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
                            <div className="p-6 flex gap-6">
                                <div className="space-y-3 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                                        <div className="space-y-2">
                                            <div className="w-48 h-6 bg-muted rounded animate-pulse" />
                                            <div className="w-32 h-3 bg-muted rounded animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[1, 2, 3, 4].map(j => <div key={j} className="h-10 bg-muted rounded-lg animate-pulse" />)}
                                    </div>
                                </div>
                                <div className="flex-1 bg-muted/40 rounded-xl" />
                                <div className="w-36 space-y-2">
                                    <div className="h-10 bg-muted rounded-xl animate-pulse" />
                                    <div className="h-10 bg-muted rounded-xl animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : queue.length === 0 ? (
                <Card className="glass-card border-primary/10">
                    <CardContent className="p-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <ScanLine className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Queue is Empty</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            There are currently no patients waiting in the triage queue.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    <AnimatePresence>
                        {queue.map((patient, index) => (
                            <motion.div
                                key={patient.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                            >
                                <Card className={`glass-card overflow-hidden border-2 transition-all hover:shadow-xl hover:scale-[1.01] duration-300 ${patient.priority_level === 'RED' ? 'border-red-500/30 ring-1 ring-red-500/20' :
                                    patient.priority_level === 'ORANGE' ? 'border-orange-500/30 ring-1 ring-orange-500/20' :
                                        patient.priority_level === 'YELLOW' ? 'border-yellow-500/30 ring-1 ring-yellow-500/20' :
                                            patient.priority_level === 'GREEN' ? 'border-green-500/30 ring-1 ring-green-500/20' :
                                                'border-blue-500/30 ring-1 ring-blue-500/20'
                                    }`}>
                                    <CardContent className="p-0">
                                        <div className="flex flex-col lg:flex-row items-stretch">
                                            {/* Side Priority Indicator (Vertical) */}
                                            <div className={`w-2 shrink-0 ${patient.priority_level === 'RED' ? 'bg-red-500' :
                                                patient.priority_level === 'ORANGE' ? 'bg-orange-500' :
                                                    patient.priority_level === 'YELLOW' ? 'bg-yellow-500' :
                                                        patient.priority_level === 'GREEN' ? 'bg-green-500' : 'bg-blue-500'
                                                }`} />

                                            <div className="flex-1 p-6">
                                                <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                                                    {/* Patient Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center shrink-0">
                                                                <Users className="w-6 h-6 text-muted-foreground" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h3 className="text-xl font-bold text-foreground truncate tracking-tight">
                                                                    {patient.patient_name}
                                                                </h3>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${PRIORITY_COLORS[patient.priority_level]}`}>
                                                                        Level {PRIORITY_ORDER[patient.priority_level]} — {patient.priority_level}
                                                                    </span>
                                                                    <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                                                                        <Clock className="w-3 h-3" />
                                                                        {formatWaitTime(patient.arrival_time)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Vitals Readout (Grid) */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                            <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex flex-col">
                                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Heart Rate</span>
                                                                <span className="text-sm font-bold text-foreground">{patient.vitals?.hr || '--'} <span className="text-[10px] font-normal opacity-60 italic">bpm</span></span>
                                                            </div>
                                                            <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex flex-col">
                                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Blood Pressure</span>
                                                                <span className="text-sm font-bold text-foreground">{patient.vitals?.bp || '--'} <span className="text-[10px] font-normal opacity-60 italic">mmHg</span></span>
                                                            </div>
                                                            <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex flex-col">
                                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">SpO2</span>
                                                                <span className="text-sm font-bold text-foreground">{patient.vitals?.spo2 || '--'}<span className="text-[10px] font-normal opacity-60 italic">%</span></span>
                                                            </div>
                                                            <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex flex-col">
                                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Temp</span>
                                                                <span className="text-sm font-bold text-foreground">{patient.vitals?.temp || '--'}<span className="text-[10px] font-normal opacity-60 italic">°</span></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* AI Reasoning Box */}
                                                    <div className="flex-[1.2] h-full flex flex-col bg-muted/20 rounded-xl p-4 border border-primary/10 relative overflow-hidden group/box">
                                                        <div className="absolute top-0 right-0 p-1 opacity-10 group-hover/box:opacity-20 transition-opacity">
                                                            <Activity className="w-12 h-12 text-primary" />
                                                        </div>
                                                        <div className="flex items-center gap-2 mb-2 relative z-10">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Clinical Insight</span>
                                                            <span className="text-[10px] ml-auto font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                                {patient.ai_confidence}% Confidence
                                                            </span>
                                                        </div>
                                                        <p className="text-xs leading-relaxed text-foreground/90 italic font-medium relative z-10 line-clamp-3">
                                                            "{patient.ai_reasoning}"
                                                        </p>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex flex-row lg:flex-col gap-2 shrink-0 w-full lg:w-36">
                                                        {patient.patient_id && (
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => navigate(`/patient/analysis/${patient.patient_id}`)}
                                                                className="w-full border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-all font-bold text-xs gap-2 h-10 rounded-xl"
                                                            >
                                                                <TrendingUp className="w-4 h-4" />
                                                                Analysis
                                                            </Button>
                                                        )}
                                                        <Button
                                                            onClick={() => markAttended(patient.id)}
                                                            className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20 transition-all font-bold text-xs gap-2 h-10 rounded-xl"
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                            Attended
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => openBedModal(patient)}
                                                            className="w-full border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-all font-bold text-xs gap-2 h-10 rounded-xl"
                                                        >
                                                            <BedDouble className="w-4 h-4" />
                                                            Assign Bed
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {isModalOpen && (
                <TriageAssessmentModal
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        fetchQueue();
                    }}
                />
            )}
            
            {/* Modal for Bed Assignment via Bridge */}
            {isBedModalOpen && parseInt(patientToAssignBed?.id ? "1" : "0") > 0 && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm glass-card">
                        <CardContent className="p-6">
                            <h3 className="font-bold text-lg mb-4">Assign Bed & Mark Attended</h3>
                            <p className="text-sm mb-4 text-muted-foreground">Patient: {patientToAssignBed?.patient_name}</p>
                            <select className="w-full p-2 rounded-md mb-4 bg-background border border-border" 
                                value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)}>
                                <option value="">Select Bed...</option>
                                {availableBeds.map(b => (
                                    <option key={b.id} value={b.id}>{b.ward_type} - {b.bed_number}</option>
                                ))}
                            </select>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => {setIsBedModalOpen(false); setSelectedBedId("");}}>Cancel</Button>
                                <Button onClick={confirmAssignBed} disabled={!selectedBedId} className="bg-primary hover:bg-primary/90 text-white">Assign Bed</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
            </>
            )}
        </div>
    );
}
