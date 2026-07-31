import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Activity, AlertTriangle, Users, TrendingUp, RefreshCw, Zap, ShieldAlert, BedDouble, Pill, ExternalLink, ChevronDown, ChevronUp, HeartPulse, Brain, Search, CheckCircle2, Pencil, Plus, Trash2, FileText, Download, Printer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

interface ForecastBreakdown {
    time_pattern: number;
    resource_pressure_mult: number;
    prescription_risk_adj: number;
    chronic_contribution: number;
    season: string;
    seasonal_multiplier: number;
    seasonal_conditions: string[];
    high_risk_patients: number;
    complex_patients: number;
    total_analysed: number;
    top_risk_categories: [string, { patient_count: number; visit_frequency: number; risk_weight: number }][];
    method: string;
}

interface Snapshot {
    load_index: string;
    load_score: number;
    forecast_1h: number;
    forecast_4h: number;
    occupied_beds: number;
    total_beds: number;
    waiting_patients: number;
    forecast_breakdown?: ForecastBreakdown;
}

interface Alert {
    id: string;
    alert_type: string;
    message: string;
    severity: string;
    ai_recommendation: string;
    created_at: string;
    acknowledged: boolean;
    metadata?: {
        summary: string;
        sections: Array<{ title: string; status: string; details: string }>;
        strategic_actions: Array<{ priority: string; title: string; instruction: string }>;
    };
}

interface Bed {
    id: string;
    ward_type: string;
    bed_number: string;
    status: string;
    patient_id: string | null;
    triage_id: string | null;
    priority_assigned: string | null;
    est_discharge: string | null;
}



const BedItem = memo(({ bed, onSelect, onDelete }: { bed: Bed, onSelect: (b: Bed) => void, onDelete: (id: string) => void }) => {
    return (
        <div className="group relative">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(bed)}
                className={`
                    w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 border shadow-sm
                    ${bed.status === 'occupied' ? 'bg-orange-500 text-white border-orange-600' : 
                      bed.status === 'reserved' ? 'bg-blue-500 text-white border-blue-600' :
                      bed.status === 'maintenance' ? 'bg-slate-300 text-slate-600' : 
                      'bg-white hover:bg-emerald-50 text-emerald-600 border-border/60 hover:border-emerald-200'}
                    transition-all duration-200
                `}
            >
                <span className="text-[9px] font-black font-mono tracking-tighter opacity-80">{bed.bed_number.split('-')[0]}</span>
                <span className="text-xs font-black font-mono leading-none">{bed.bed_number.split('-')[1]}</span>
            </motion.button>
            
            {bed.status === 'available' && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(bed.id); }}
                    className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                    <Plus className="w-2 h-2 rotate-45" />
                </button>
            )}
        </div>
    );
});



const DoctorItem = memo(({ doc, onChangeShift, onChangeWard }: { doc: any, onChangeShift: (d: any, shift: string) => void, onChangeWard: (d: any, ward: string) => void }) => {
    const latest = doc.latest_assignment;
    
    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: "bg-orange-500/10 text-orange-600 border-orange-500/20",
            accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
            rejected: "bg-red-500/10 text-red-500 border-red-500/20",
            no_response: "bg-slate-500/10 text-slate-600 border-slate-500/20"
        };
        return (
            <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded border animate-pulse-subtle ${colors[status] || 'bg-muted/10 text-muted-foreground'}`}>
                {status.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 gap-2">
            <div>
                <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-primary">{doc.name}</p>
                    {latest && getStatusBadge(latest.status)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">{doc.specialization || 'General'}</span>
                    {doc.verified && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Verified</span>}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <select 
                    value={doc.ward_assigned || 'General Ward'} 
                    onChange={(e) => onChangeWard(doc, e.target.value)}
                    className="text-[10px] sm:text-xs p-1.5 rounded bg-background border border-border"
                >
                    <option value="General Ward">General Ward</option>
                    <option value="Emergency">Emergency</option>
                    <option value="ICU">ICU</option>
                    <option value="Operation Theater">Operation Theater</option>
                    <option value="Pediatrics">Pediatrics</option>
                    <option value="Outpatient">Outpatient</option>
                </select>

                <select 
                    value={doc.shift_type || 'Day Shift'}
                    onChange={(e) => onChangeShift(doc, e.target.value)}
                    className={`text-[10px] sm:text-xs font-bold p-1.5 rounded border border-border ${
                        doc.shift_type?.includes('Night') ? 'bg-secondary text-secondary-foreground' 
                        : doc.shift_type?.includes('Emergency') ? 'bg-destructive text-destructive-foreground' 
                        : 'bg-primary text-primary-foreground'
                    }`}
                >
                    <option className="bg-background text-foreground" value="Morning Shift">Morning Shift</option>
                    <option className="bg-background text-foreground" value="Day Shift">Day Shift</option>
                    <option className="bg-background text-foreground" value="Night Shift">Night Shift</option>
                    <option className="bg-background text-foreground" value="Emergency Shift">Emergency Shift</option>
                    <option className="bg-background text-foreground" value="ICU Ward Shift">ICU Ward Shift</option>
                </select>
            </div>
        </div>
    );
});

export function ResourceLoadBalancer() {
    const [activeResourceTab, setActiveResourceTab] = useState<'facilities' | 'pharmacy'>('facilities');
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [beds, setBeds] = useState<Bed[]>([]);

    const [doctors, setDoctors] = useState<any[]>([]);
    const [pharmacyData, setPharmacyData] = useState<any[]>([]);
    const [loadingAI, setLoadingAI] = useState(false);

    // Active patients for assignment/pharmacy
    const [activePatients, setActivePatients] = useState<any[]>([]);
    const [selectedBed, setSelectedBed] = useState<Bed | null>(null);
    const [assignPatientId, setAssignPatientId] = useState("");

    // Pharmacy Dispense State
    const [dispenseMed, setDispenseMed] = useState<any | null>(null);
    const [dispenseAmount, setDispenseAmount] = useState(1);
    const [dispensePatient, setDispensePatient] = useState("");
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [medicineSearch, setMedicineSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    // Bed Assignment State Extensions
    const [allPatients, setAllPatients] = useState<any[]>([]);
    const [assignMode, setAssignMode] = useState<'triage' | 'database' | 'new'>('triage');
    const [newPatientName, setNewPatientName] = useState("");
    const [newPatientPriority, setNewPatientPriority] = useState("GREEN");

    const [isTransferring, setIsTransferring] = useState(false);
    const [targetBedId, setTargetBedId] = useState("");

    useEffect(() => {
        const h = setTimeout(() => setDebouncedSearch(medicineSearch), 250);
        return () => clearTimeout(h);
    }, [medicineSearch]);


    const fetchSnapshot = useCallback(async (hId: string) => {
        try {
            const res = await fetch(`${BACKEND_URL}/resource/snapshot/${hId}`);
            if (res.ok) setSnapshot(await res.json());
        } catch (e) { }
    }, []);

    const fetchBeds = useCallback(async (hId: string) => {
        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds/${hId}`);
            if (res.ok) setBeds(await res.json());
        } catch (e) { }
    }, []);



    const fetchDoctors = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/resource/doctors`);
            if (res.ok) setDoctors(await res.json());
        } catch (e) { }
    }, []);

    const fetchPharmacy = useCallback(async (hId: string) => {
        try {
            const res = await fetch(`${BACKEND_URL}/resource/pharmacy/${hId}`);
            if (res.ok) setPharmacyData(await res.json());
        } catch (e) { }
    }, []);

    const fetchAlerts = useCallback(async (hId: string) => {
        const { data } = await supabase.from('resource_alerts').select('*').eq('hospital_id', hId).eq('acknowledged', false).order('created_at', { ascending: false }).limit(10);
        if (data) setAlerts(data);
    }, []);

    const fetchActivePatients = useCallback(async (hId: string) => {
        const { data } = await supabase.from('triage_queue').select('*').eq('hospital_id', hId).in('status', ['waiting', 'in_treatment']);
        if (data) setActivePatients(data);
    }, []);

    const fetchAllPatients = useCallback(async () => {
        const { data } = await supabase.from('patients').select('*');
        if (data) setAllPatients(data);
    }, []);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const hId = user.id;

            // Batch initial load for speed
            await Promise.all([
                fetchSnapshot(hId),
                fetchBeds(hId),
    
                fetchAlerts(hId),
                fetchActivePatients(hId),
                fetchPharmacy(hId),
                fetchDoctors(),
                fetchAllPatients()
            ]);

            // Realtime subscriptions
            const snapSub = supabase.channel('snap-changes')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'load_snapshots', filter: `hospital_id=eq.${hId}` }, () => fetchSnapshot(hId))
                .subscribe();

            const alertSub = supabase.channel('alert-changes')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resource_alerts', filter: `hospital_id=eq.${hId}` }, (p) => {
                    setAlerts(prev => [p.new as Alert, ...prev]);
                })
                .subscribe();

            const bedSub = supabase.channel('bed-changes')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hospital_beds', filter: `hospital_id=eq.${hId}` }, () => fetchBeds(hId))
                .subscribe();

            const pharmacySub = supabase.channel('pharmacy-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'medicines' }, () => fetchPharmacy(hId))
                .subscribe();

            return () => {
                supabase.removeChannel(snapSub);
                supabase.removeChannel(alertSub);
                supabase.removeChannel(bedSub);
                supabase.removeChannel(pharmacySub);
            }
        };
        init();
    }, [fetchSnapshot, fetchBeds, fetchAlerts, fetchActivePatients, fetchPharmacy, fetchDoctors, fetchAllPatients]);

    const handleAddBed = async (ward: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const bedNum = prompt("Enter Bed Number (e.g. ICU-06):");
        if (!bedNum) return;

        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hospital_id: user.id,
                    ward_type: ward,
                    bed_number: bedNum
                })
            });
            if (res.ok) fetchBeds(user.id);
        } catch(e) {}
    };

    const handleDeleteBed = async (bedId: string) => {
        if (!confirm("Remove this bed permanently?")) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds/${bedId}`, { method: 'DELETE' });
            if (res.ok) fetchBeds(user.id);
        } catch(e) {}
    };

    const handlePrintReport = () => {
        window.print();
    };

    const runAI = async () => {
        setLoadingAI(true);
        const { data: { user } } = await supabase.auth.getUser();
        try {
            await fetch(`${BACKEND_URL}/resource/analyze/${user?.id}`, { method: 'POST' });
        } finally {
            setLoadingAI(false);
        }
    }

    const assignBed = async () => {
        if (!selectedBed || (!assignPatientId && assignMode !== 'new') || (assignMode === 'new' && !newPatientName)) return;

        const { data: { user } } = await supabase.auth.getUser();
        let finalTriageId = "";
        let finalPatientId = null;
        let finalPriority = "GREEN";

        if (assignMode === 'triage') {
            const pt = activePatients.find(p => p.id === assignPatientId);
            if (!pt) return;
            finalTriageId = pt.id;
            finalPatientId = pt.patient_id;
            finalPriority = pt.priority_level;
        } else if (assignMode === 'database') {
            const dbPt = allPatients.find(p => p.id === assignPatientId);
            if (!dbPt) return;
            const { data } = await supabase.from('triage_queue').insert({
                patient_id: dbPt.id,
                patient_name: dbPt.full_name,
                hospital_id: user?.id,
                priority_level: 'GREEN',
                status: 'waiting'
            }).select().single();
            if (data) {
                finalTriageId = data.id;
                finalPatientId = dbPt.id;
            }
        } else if (assignMode === 'new') {
            const { data } = await supabase.from('triage_queue').insert({
                patient_name: newPatientName,
                hospital_id: user?.id,
                priority_level: newPatientPriority,
                status: 'waiting'
            }).select().single();
            if (data) {
                finalTriageId = data.id;
                finalPriority = newPatientPriority;
            }
        }

        try {
            await fetch(`${BACKEND_URL}/resource/beds/${selectedBed.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'occupied',
                    triage_id: finalTriageId,
                    patient_id: finalPatientId,
                    priority_assigned: finalPriority
                })
            });
            await supabase.from('triage_queue').update({ status: 'in_treatment' }).eq('id', finalTriageId);
            setSelectedBed(null);
            setAssignPatientId("");
            setNewPatientName("");
            setAssignMode('triage');
            fetchActivePatients(user?.id || "");
            fetchBeds(user?.id || "");
        } catch (e) { }
    }

    const handleDischargePatient = async () => {
        if (!selectedBed) return;
        try {
            await fetch(`${BACKEND_URL}/resource/beds/${selectedBed.id}/discharge`, { method: 'POST' });
            setSelectedBed(null);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                fetchBeds(user.id);
                fetchActivePatients(user.id);
            }
        } catch (e) { }
    }

    const handleTransferPatient = async () => {
        if (!selectedBed || !targetBedId) return;
        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_bed_id: selectedBed.id,
                    target_bed_id: targetBedId
                })
            });
            if (res.ok) {
                setSelectedBed(null);
                setIsTransferring(false);
                setTargetBedId("");
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    fetchBeds(user.id);
                }
            }
        } catch (e) { }
    }

    const handleSyncLayout = async () => {
        if (!confirm("This will RESET ALL BEDS to the standard 68-bed layout (5 ICU, 13 EMERGENCY, 22 OBSERVATION, 28 GENERAL). Proceed?")) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            const res = await fetch(`${BACKEND_URL}/resource/beds/reset/${user.id}`, { method: 'POST' });
            if (res.ok) fetchBeds(user.id);
        } catch(e) {}
    }



    const updateDoctorShift = async (d: any, shift: string) => {
        // Optimistic UI update
        setDoctors(prev => prev.map(doc => doc.id === d.id ? { ...doc, shift_type: shift } : doc));
        
        try {
            await fetch(`${BACKEND_URL}/resource/doctors/${d.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shift_type: shift })
            });
        } catch (e) {
            fetchDoctors(); // Rollback on error
        }
    }

    const updateDoctorWard = async (d: any, ward: string) => {
        // Optimistic UI update
        setDoctors(prev => prev.map(doc => doc.id === d.id ? { ...doc, ward_assigned: ward } : doc));
        
        try {
            await fetch(`${BACKEND_URL}/resource/doctors/${d.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ward_assigned: ward })
            });
        } catch (e) {
            fetchDoctors(); // Rollback on error
        }
    }

    const dispenseToPatient = async () => {
        if (!dispenseMed || !dispensePatient) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await fetch(`${BACKEND_URL}/resource/pharmacy/dispense/${user?.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    medicine_id: dispenseMed.id,
                    quantity_dispensed: dispenseAmount,
                    triage_id: dispensePatient
                })
            });
            setDispenseMed(null);
            setDispenseAmount(1);
            setDispensePatient("");
            fetchPharmacy(user?.id || "");
        } catch (e) { }
    }

    const ackAlert = async (id: string) => {
        await supabase.from('resource_alerts').update({ acknowledged: true }).eq('id', id);
        setAlerts(prev => prev.filter(a => a.id !== id));
    }

    const getRingColor = (idx: string) => {
        if (idx === 'LOW') return 'text-green-500';
        if (idx === 'MODERATE') return 'text-amber-500';
        if (idx === 'PEAK') return 'text-orange-500';
        return 'text-red-500';
    }

    const bedsByWard = useMemo(() => {
        const wards = ['ICU', 'EMERGENCY', 'OBSERVATION', 'GENERAL'];
        return wards.reduce((acc, ward) => ({ ...acc, [ward]: beds.filter(b => b.ward_type === ward) }), {} as Record<string, Bed[]>);
    }, [beds]);

    const activeDispensePatients = useMemo(() => {
        return activePatients.filter(p => {
            if (p.status === 'waiting') return true;
            if (p.status === 'in_treatment') {
                return beds.some(b => b.triage_id === p.id && b.status === 'occupied');
            }
            return false;
        });
    }, [activePatients, beds]);

    const filteredPharmacyItems = useMemo(() => {
        const search = debouncedSearch.toLowerCase();
        return pharmacyData.flatMap((cat: any) => cat.items)
            .filter((m: any) =>
                m.drug_name.toLowerCase().includes(search) ||
                (m.strength || "").toLowerCase().includes(search)
            );
    }, [pharmacyData, debouncedSearch]);

    return (
        <div className="space-y-6">
            <div className="flex bg-muted/40 p-1.5 rounded-xl w-fit">
                    <Button
                        variant={activeResourceTab === 'facilities' ? 'default' : 'ghost'}
                        onClick={() => setActiveResourceTab('facilities')}
                        className={`rounded-lg px-6 flex items-center gap-2 ${activeResourceTab === 'facilities' ? 'shadow-md shadow-primary/20 bg-primary text-white' : ''}`}
                    >
                        <BedDouble className="w-4 h-4" /> Beds & Resources
                    </Button>
                <Button
                    variant={activeResourceTab === 'pharmacy' ? 'default' : 'ghost'}
                    onClick={() => setActiveResourceTab('pharmacy')}
                    className={`rounded-lg px-6 flex items-center gap-2 ${activeResourceTab === 'pharmacy' ? 'shadow-md shadow-primary/20 bg-primary text-white' : ''}`}
                >
                    <Pill className="w-4 h-4" /> Pharmacy Stock
                </Button>
            </div>

            <Card className="glass-card overflow-hidden">
                <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                            <div className={`relative flex items-center justify-center w-32 h-32 rounded-full border-8 shadow-inner ${snapshot ? getRingColor(snapshot.load_index).replace('text-', 'border-') : 'border-muted'}`}>
                                <div className="text-center">
                                    <h2 className={`text-2xl font-bold ${snapshot ? getRingColor(snapshot.load_index) : ''}`}>{snapshot?.load_index || '...'}</h2>
                                    <p className="text-xs font-medium text-muted-foreground">{snapshot ? Math.round(snapshot.load_score * 100) : 0}% LOAD</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-lg text-sm font-bold">
                                    <TrendingUp className="w-4 h-4" /> ↑ {snapshot?.forecast_1h || 0} expected in 1h
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-lg text-sm font-bold">
                                    <TrendingUp className="w-4 h-4" /> ↑ {snapshot?.forecast_4h || 0} expected in 4h
                                </div>
                                <button
                                    onClick={() => setShowBreakdown(prev => !prev)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium cursor-pointer"
                                >
                                    <HeartPulse className="w-3.5 h-3.5" />
                                    {showBreakdown ? 'Hide' : 'Show'} Prescription Risk Breakdown
                                    {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => supabase.auth.getUser().then(u => fetchSnapshot(u.data.user?.id || ""))} className="gap-2">
                                <RefreshCw className="w-4 h-4" /> Refresh Snapshot
                            </Button>
                            <Button onClick={runAI} disabled={loadingAI} className="bg-primary hover:bg-primary/90 text-white gap-2">
                                <Zap className="w-4 h-4" /> {loadingAI ? "Analyzing..." : "AI Analysis"}
                            </Button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showBreakdown && snapshot?.forecast_breakdown && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="mt-6 pt-6 border-t border-border/50">
                                    <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-primary" /> Inflow Forecast Breakdown
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                    <span className="text-sm font-medium">Time pattern</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold font-mono">~{snapshot.forecast_breakdown.time_pattern}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">patients</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                                                    <span className="text-sm font-medium">Chronic visits</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold font-mono">+{snapshot.forecast_breakdown.chronic_contribution}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">from prescriptions</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    <span className="text-sm font-medium">Prescription risk</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold font-mono">+{snapshot.forecast_breakdown.prescription_risk_adj}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">({snapshot.forecast_breakdown.high_risk_patients} high-risk)</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                    <span className="text-sm font-medium">Resource pressure</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold font-mono">× {snapshot.forecast_breakdown.resource_pressure_mult}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">(beds {snapshot.occupied_beds}/{snapshot.total_beds})</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-sm font-medium">Season factor</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-sm font-bold font-mono">× {snapshot.forecast_breakdown.seasonal_multiplier}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">({snapshot.forecast_breakdown.season})</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <p className="text-xs font-bold text-muted-foreground">Top risk categories in your patient population:</p>
                                            {(snapshot.forecast_breakdown.top_risk_categories || []).map(([catName, catData]) => {
                                                const maxCount = Math.max(
                                                    ...snapshot.forecast_breakdown!.top_risk_categories.map(([, d]) => d.patient_count),
                                                    1
                                                );
                                                const pct = Math.round((catData.patient_count / maxCount) * 100);
                                                const catColors: Record<string, string> = {
                                                    CARDIOVASCULAR: 'bg-red-500',
                                                    RESPIRATORY: 'bg-sky-500',
                                                    DIABETES_METABOLIC: 'bg-amber-500',
                                                    NEUROLOGICAL: 'bg-violet-500',
                                                    RENAL: 'bg-emerald-500',
                                                    ONCOLOGY: 'bg-pink-500',
                                                    MENTAL_HEALTH: 'bg-indigo-500',
                                                    SURGICAL_RECOVERY: 'bg-orange-500'
                                                };
                                                return (
                                                    <div key={catName}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-xs font-bold uppercase tracking-wide">{catName.replace('_', ' ')}</span>
                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                {catData.patient_count} patients · {catData.visit_frequency}/mo each
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${pct}%` }}
                                                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                                                className={`h-full rounded-full ${catColors[catName] || 'bg-primary'}`}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {snapshot.forecast_breakdown.seasonal_conditions.length > 0 && (
                                                <div className="pt-2">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Common seasonal risks:</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {snapshot.forecast_breakdown.seasonal_conditions.map(c => (
                                                            <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/10 capitalize font-medium">
                                                                {c}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-4 pt-2 border-t border-border/30">
                                                {snapshot.forecast_breakdown.complex_patients > 0 && (
                                                    <span className="text-[10px] px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold">
                                                        {snapshot.forecast_breakdown.complex_patients} complex (3+ conditions)
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {snapshot.forecast_breakdown.total_analysed} records analysed
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            {activeResourceTab === 'facilities' && (
                <div className="flex flex-col lg:flex-row gap-6">
                    <Card className="flex-[3] glass-card">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2"><BedDouble className="w-5 h-5 text-primary" /> Facility Resource Map</h3>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 gap-2 border-primary/20 hover:bg-primary/5 text-primary font-bold text-[10px]"
                                    onClick={handleSyncLayout}
                                >
                                    <RefreshCw className="w-3 h-3" /> Sync 68-Bed Layout
                                </Button>
                            </div>
                            
                            <div className="space-y-8 print:hidden">
                                {Object.entries(bedsByWard).map(([ward, wardBeds]) => (
                                    <div key={ward} className="relative">
                                        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{ward}</h4>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-6 gap-1 text-[10px] text-primary hover:bg-primary/5"
                                                onClick={() => handleAddBed(ward)}
                                            >
                                                <Plus className="w-3 h-3" /> Add Bed
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-2">
                                            {wardBeds.map(bed => (
                                                <BedItem 
                                                    key={bed.id} 
                                                    bed={bed} 
                                                    onSelect={setSelectedBed} 
                                                    onDelete={handleDeleteBed} 
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="flex-[2] glass-card">
                        <CardContent className="p-6">
                            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Users className="w-5 h-5 text-primary" /> Personnel Management</h3>
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-2 mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Registered Doctors</h4>
                                    {doctors.length > 0 ? (
                                        <div className="grid gap-2">
                                            {doctors.map(d => (
                                                <DoctorItem 
                                                    key={d.id} 
                                                    doc={d} 
                                                    onChangeShift={updateDoctorShift} 
                                                    onChangeWard={updateDoctorWard} 
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-muted/20 border border-dashed border-border rounded-lg text-center">
                                            <p className="text-xs font-bold text-muted-foreground mb-1">No Active Doctors</p>
                                            <p className="text-[10px] text-muted-foreground italic">Real-time database sync: No doctors have signed into the system yet.</p>
                                        </div>
                                    )}
                                </div>
                                

                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeResourceTab === 'pharmacy' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <Pill className="text-primary w-6 h-6" /> Pharmacy Stock
                            </h2>
                            <p className="text-sm text-muted-foreground">Emergency medication & supply tracking</p>
                        </div>
                    </div>

                    <Card className="glass-card overflow-hidden">
                        <CardContent className="p-0">
                            <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <h3 className="text-xl font-bold">Comprehensive Medicines Record</h3>
                                <div className="relative w-full sm:w-80">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or strength..."
                                        className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        value={medicineSearch}
                                        onChange={(e) => setMedicineSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-muted/10 border-b border-border/50">
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Medicine Name</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Strength</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unit/Size</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">In Stock</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Req. Prescription</th>
                                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {filteredPharmacyItems.map((med: any) => (
                                                <tr key={med.id} className="hover:bg-muted/5 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <span className="text-blue-600 font-bold text-sm cursor-pointer hover:underline">{med.drug_name}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-muted-foreground">
                                                        {med.strength || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-muted-foreground">
                                                        {med.unit || '-'}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="inline-flex items-center justify-center px-4 py-1 bg-muted/50 rounded-full font-mono font-bold text-xs">
                                                            {med.quantity}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {med.requires_prescription ? (
                                                            <div className="flex justify-center">
                                                                <CheckCircle2 className="w-4 h-4 text-amber-500" />
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="hover:scale-110 transition-transform bg-transparent hover:bg-muted/50"
                                                            onClick={() => {
                                                                setDispenseMed(med);
                                                                setDispenseAmount(1);
                                                            }}
                                                        >
                                                            <Pencil className="w-4 h-4 text-muted-foreground" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeResourceTab === 'facilities' && (
                <div className="mt-8 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Brain className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-lg font-bold tracking-tight">Hospital Intelligence Report</h2>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handlePrintReport} className="h-8 gap-2 glass-card">
                                <Printer className="w-4 h-4" /> Print PDF
                            </Button>
                            <Button 
                                className="h-8 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white" 
                                size="sm"
                                onClick={() => {
                                    const report = alerts.map(a => `[${a.severity}] ${a.alert_type}\nMessage: ${a.message}\nAction: ${a.ai_recommendation}`).join('\n\n');
                                    const blob = new Blob([`RESOURCE INTELLIGENCE REPORT\nGenerated: ${new Date().toLocaleString()}\n\n${report}`], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `hospital-report-${new Date().toISOString().split('T')[0]}.txt`;
                                    link.click();
                                }}
                            >
                                <Download className="w-4 h-4" /> Download Report
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 print:block">
                        {alerts.length === 0 ? (
                            <Card className="glass-card border-dashed border-2 flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FileText className="w-12 h-12 mb-4 opacity-20" />
                                <p>No active intelligence reports. Run "Analyze Resources" to generate.</p>
                            </Card>
                        ) : (
                            <div className="space-y-4">
                            <div className="space-y-6">
                                {alerts.map((a, idx) => (
                                    <motion.div key={a.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                                        <Card className={`glass-card overflow-hidden border-t-4 ${a.severity === 'CRITICAL' ? 'border-t-red-500' : 'border-t-indigo-500 shadow-lg shadow-indigo-500/5'}`}>
                                            <CardContent className="p-0">
                                                <div className="bg-muted/30 p-4 border-b border-border/50 flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`px-2 py-0.5 rounded text-[10px] font-black tracking-tighter text-white ${a.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-indigo-500'}`}>
                                                            AI INTELLIGENCE
                                                        </div>
                                                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{a.alert_type.replace('_', ' ')}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] text-muted-foreground font-mono">{new Date(a.created_at).toLocaleTimeString()}</span>
                                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] hover:text-red-500" onClick={() => ackAlert(a.id)}>Mark Reviewed</Button>
                                                    </div>
                                                </div>
                                                
                                                <div className="p-6 space-y-8">
                                                    {/* Executive Summary */}
                                                    <div className="max-w-4xl">
                                                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                                                            <Activity className="w-4 h-4 text-primary" /> Executive summary
                                                        </h4>
                                                        <p className="text-xl font-bold text-foreground/90 leading-snug italic border-l-4 border-primary/20 pl-4 py-1">
                                                            "{a.message}"
                                                        </p>
                                                    </div>

                                                    {/* Sections Grid */}
                                                    {a.metadata?.sections && (
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            {a.metadata.sections.map((section, sidx) => (
                                                                <div key={sidx} className="p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <h5 className="text-xs font-black uppercase tracking-wider">{section.title}</h5>
                                                                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                                            section.status === 'CRITICAL' ? 'bg-red-500/10 text-red-600 border border-red-500/20' :
                                                                            section.status === 'WARNING' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                                                            'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                                                        }`}>
                                                                            {section.status}
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                                                        {section.details}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Strategic Actions */}
                                                    <div className="space-y-4">
                                                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                                            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" /> Strategic Protocol
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {(a.metadata?.strategic_actions || []).map((action, aidx) => (
                                                                <div key={aidx} className={`p-4 rounded-xl border flex gap-4 ${
                                                                    action.priority === 'URGENT' ? 'bg-red-500/5 border-red-500/20' : 'bg-indigo-500/5 border-indigo-500/20'
                                                                }`}>
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                                                        action.priority === 'URGENT' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                                                    }`}>
                                                                        <ShieldAlert className="w-4 h-4" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-black uppercase text-foreground mb-1">{action.title}</p>
                                                                        <p className="text-sm font-medium text-muted-foreground leading-tight">{action.instruction}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Stats Bar */}
                                                    <div className="pt-6 border-t border-border/50 flex flex-wrap gap-8 items-center text-muted-foreground">
                                                        <div className="flex items-center gap-2">
                                                            <TrendingUp className="w-4 h-4 text-blue-500" />
                                                            <span className="text-[10px] font-bold">INFLOW +{snapshot?.forecast_1h} (1h)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <BedDouble className="w-4 h-4 text-emerald-500" />
                                                            <span className="text-[10px] font-bold">LOAD {Math.round(snapshot?.load_score! * 100)}%</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Brain className="w-4 h-4 text-indigo-500" />
                                                            <span className="text-[10px] font-bold">POPL. RISK: {snapshot?.forecast_breakdown?.high_risk_patients} CHRONIC</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="hidden print:block p-8 font-sans">
                <div className="flex justify-between items-center mb-12 border-b-2 border-slate-900 pb-4">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter">MyHealthChain™ Intelligence Report</h1>
                        <p className="text-sm text-slate-500">Resource Load & Patient Flow Strategic Analysis</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold uppercase">Timestamp</p>
                        <p className="text-sm">{new Date().toLocaleString()}</p>
                    </div>
                </div>
                
                {alerts.map(a => (
                    <div key={a.id} className="mb-12 page-break-inside-avoid">
                        <div className="flex justify-between items-end mb-6">
                            <h2 className="text-3xl font-black uppercase text-slate-900 leading-none">Intelligence Audit: {a.alert_type}</h2>
                            <p className="text-xs text-slate-400 font-mono tracking-widest">{a.severity} SEVERITY</p>
                        </div>
                        
                        <div className="bg-slate-50 p-6 rounded-lg border-2 border-slate-900 mb-8">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Executive Summary</h3>
                            <p className="text-xl font-bold leading-tight text-slate-900 border-l-4 border-slate-900 pl-4 py-1 italic">"{a.message}"</p>
                        </div>

                        {a.metadata?.sections && (
                            <div className="grid grid-cols-3 gap-6 mb-8">
                                {a.metadata.sections.map(s => (
                                    <div key={s.title} className="p-4 border border-slate-200 rounded-lg">
                                        <h4 className="text-[10px] font-black uppercase text-slate-500 mb-2 flex justify-between">
                                            {s.title} <span className="font-mono text-slate-900">{s.status}</span>
                                        </h4>
                                        <p className="text-xs text-slate-600 leading-snug">{s.details}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mb-10">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Strategic Tactical Protocols</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {(a.metadata?.strategic_actions || []).map((action, i) => (
                                    <div key={i} className="flex gap-4 p-4 bg-slate-100 rounded border border-slate-200">
                                        <div className="w-6 h-6 bg-slate-900 text-white rounded flex items-center justify-center shrink-0 font-bold text-xs">{i+1}</div>
                                        <div>
                                            <p className="text-xs font-black uppercase mb-1">{action.title} — {action.priority}</p>
                                            <p className="text-sm font-medium text-slate-700">{action.instruction}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200">
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-1">Expected Inflow</h4>
                                <p className="text-lg font-bold">+{snapshot?.forecast_1h} patients / h</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-1">Facility Load</h4>
                                <p className="text-lg font-bold">{Math.round(snapshot?.load_score! * 100)}% Capacity</p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-1">Clinical Risk</h4>
                                <p className="text-lg font-bold">{snapshot?.forecast_breakdown?.high_risk_patients} Chronic Cases</p>
                            </div>
                        </div>
                    </div>
                ))}

                <div className="mt-20 pt-8 border-t border-slate-200 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest italic">Confidential Medical Intelligence Report — Authorized Personnel Only</p>
                </div>
            </div>

            {selectedBed && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm glass-card">
                        <CardContent className="p-6">
                            {selectedBed.status === 'occupied' ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-lg">Bed {selectedBed.bed_number}</h3>
                                        <div className="px-2 py-1 rounded-md bg-orange-500 text-white text-[10px] font-bold uppercase">Occupied</div>
                                    </div>
                                    
                                    {(() => {
                                        const patient = activePatients.find(p => p.id === selectedBed.triage_id);
                                        if (!patient) return <p className="text-sm text-muted-foreground italic">Patient data not found.</p>;
                                        return (
                                            <div className="space-y-3">
                                                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Assigned Patient</p>
                                                    <p className="font-bold text-lg">{patient.patient_name}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-${patient.priority_level === 'RED' ? 'red-500' : patient.priority_level === 'ORANGE' ? 'orange-500' : 'amber-500'}`}>
                                                            {patient.priority_level}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground italic">Arrived {new Date(patient.arrival_time).toLocaleTimeString()}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="p-2 rounded-lg bg-muted/20 text-center">
                                                        <p className="text-[8px] font-bold text-muted-foreground uppercase">Rate</p>
                                                        <p className="text-xs font-bold">{patient.vitals?.heart_rate || '--'} bpm</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-muted/20 text-center">
                                                        <p className="text-[8px] font-bold text-muted-foreground uppercase">BP</p>
                                                        <p className="text-xs font-bold">{patient.vitals?.bp || '--'}</p>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-muted/20 text-center">
                                                        <p className="text-[8px] font-bold text-muted-foreground uppercase">SpO2</p>
                                                        <p className="text-xs font-bold">{patient.vitals?.spo2 || '--'}%</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="pt-2">
                                                    <Button onClick={handleDischargePatient} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold h-10 gap-2">
                                                        <Users className="w-4 h-4" /> Discharge Patient
                                                    </Button>
                                                </div>

                                                <div className="pt-2">
                                                    {!isTransferring ? (
                                                        <Button 
                                                            onClick={() => setIsTransferring(true)} 
                                                            variant="outline" 
                                                            className="w-full border-orange-500 text-orange-500 hover:bg-orange-50 font-bold h-10 gap-2"
                                                        >
                                                            <RefreshCw className="w-4 h-4" /> Transfer Ward/Bed
                                                        </Button>
                                                    ) : (
                                                        <div className="space-y-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                                                            <p className="text-[10px] font-black text-orange-600 uppercase">Select Target Bed</p>
                                                            <select 
                                                                className="w-full p-2 text-xs rounded-md border border-orange-200 bg-white"
                                                                value={targetBedId}
                                                                onChange={e => setTargetBedId(e.target.value)}
                                                            >
                                                                <option value="">Choose available bed...</option>
                                                                {Object.entries(bedsByWard).map(([ward, wardBeds]) => (
                                                                    <optgroup key={ward} label={ward}>
                                                                        {wardBeds.filter(b => b.status === 'available').map(b => (
                                                                            <option key={b.id} value={b.id}>{b.bed_number} ({ward})</option>
                                                                        ))}
                                                                    </optgroup>
                                                                ))}
                                                            </select>
                                                            <div className="flex gap-2">
                                                                <Button 
                                                                    onClick={handleTransferPatient} 
                                                                    disabled={!targetBedId}
                                                                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold h-8"
                                                                >
                                                                    Confirm Transfer
                                                                </Button>
                                                                <Button 
                                                                    onClick={() => setIsTransferring(false)} 
                                                                    variant="ghost" 
                                                                    className="text-xs h-8"
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <>
                                    <h3 className="font-bold text-lg mb-4">Assign Bed {selectedBed.bed_number} ({selectedBed.ward_type})</h3>
                                    
                                    <div className="flex gap-2 mb-4 bg-muted/40 p-1 rounded-lg text-sm">
                                        <button className={`flex-1 py-1 rounded ${assignMode === 'triage' ? 'bg-background shadow font-bold' : 'text-muted-foreground'}`} onClick={() => setAssignMode('triage')}>Triage Queue</button>
                                        <button className={`flex-1 py-1 rounded ${assignMode === 'database' ? 'bg-background shadow font-bold' : 'text-muted-foreground'}`} onClick={() => { setAssignMode('database'); setAssignPatientId(''); }}>All Patients</button>
                                        <button className={`flex-1 py-1 rounded ${assignMode === 'new' ? 'bg-primary text-white shadow font-bold' : 'text-muted-foreground'}`} onClick={() => setAssignMode('new')}>+ Walk-in</button>
                                    </div>

                                    {assignMode === 'triage' && (
                                        <select className="w-full p-2 rounded-md mb-4 bg-background border border-border"
                                            value={assignPatientId} onChange={e => setAssignPatientId(e.target.value)}>
                                            <option value="">Select Triage Patient...</option>
                                            {activePatients
                                                .filter(p => p.status === 'waiting')
                                                .sort((a, b) => {
                                                    const o = { "RED": 1, "ORANGE": 2, "YELLOW": 3, "GREEN": 4, "BLUE": 5 };
                                                    return (o[a.priority_level as keyof typeof o] || 9) - (o[b.priority_level as keyof typeof o] || 9);
                                                }).map(p => (
                                                    <option key={p.id} value={p.id}>[{p.priority_level}] {p.patient_name}</option>
                                                ))}
                                        </select>
                                    )}

                                    {assignMode === 'database' && (
                                        <div className="space-y-4 mb-4">
                                            <select className="w-full p-2 rounded-md bg-background border border-border"
                                                value={assignPatientId} onChange={e => setAssignPatientId(e.target.value)}>
                                                <option value="">Select Existing Patient...</option>
                                                {allPatients.map(p => (
                                                    <option key={p.id} value={p.id}>{p.full_name} ({p.uhid || 'No UHID'})</option>
                                                ))}
                                            </select>
                                            {assignPatientId && (() => {
                                                const pt = allPatients.find(p => p.id === assignPatientId);
                                                return pt && (
                                                    <div className="p-3 bg-muted/20 border border-border rounded-lg text-sm">
                                                        <p><strong>Name:</strong> {pt.full_name}</p>
                                                        <p><strong>DOB:</strong> {pt.date_of_birth || '-'}</p>
                                                        <p><strong>Blood Group:</strong> {pt.blood_group || '-'}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground italic">Note: Assigning this patient will automatically register them in the triage queue as GREEN priority.</p>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    )}

                                    {assignMode === 'new' && (
                                        <div className="space-y-4 mb-4 mt-2 p-4 pt-5 border border-dashed border-primary/40 bg-primary/5 rounded-lg relative">
                                            <div className="absolute -top-3 left-4 bg-primary text-white text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shadow">🚀 New Walk-in Patient</div>
                                            <div>
                                                <label className="text-xs font-bold text-muted-foreground mb-1 block">Patient Name</label>
                                                <input type="text" className="w-full p-2 rounded bg-background border border-border focus:ring-1 focus:ring-primary outline-none" placeholder="E.g. John Doe" value={newPatientName} onChange={e => setNewPatientName(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-muted-foreground mb-1 block">Priority Level</label>
                                                <select className="w-full p-2 rounded bg-background border border-border focus:ring-1 focus:ring-primary outline-none" value={newPatientPriority} onChange={e => setNewPatientPriority(e.target.value)}>
                                                    <option value="RED">RED - Immediate</option>
                                                    <option value="ORANGE">ORANGE - Very Urgent</option>
                                                    <option value="YELLOW">YELLOW - Urgent</option>
                                                    <option value="GREEN">GREEN - Standard</option>
                                                    <option value="BLUE">BLUE - Non-Urgent</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="outline" onClick={() => { setSelectedBed(null); setIsTransferring(false); setTargetBedId(""); setAssignMode('triage'); setAssignPatientId(""); setNewPatientName(""); }}>Close</Button>
                                {selectedBed.status !== 'occupied' && (
                                    <Button onClick={assignBed} disabled={(!assignPatientId && assignMode !== 'new') || (assignMode === 'new' && !newPatientName)} className="bg-primary hover:bg-primary/90 text-white">Assign Patient</Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {dispenseMed && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm glass-card shadow-2xl">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Pill className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight">Dispense Meds</h3>
                                    <p className="text-xs text-muted-foreground">{dispenseMed.drug_name}</p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs font-bold text-muted-foreground mb-1 block">Patient to Dispense to</label>
                                    <select className="w-full p-2.5 rounded-lg bg-background border border-border focus:ring-2 focus:ring-primary outline-none"
                                        value={dispensePatient} onChange={e => setDispensePatient(e.target.value)}>
                                        <option value="">Select Patient...</option>
                                        {activeDispensePatients.map(p => (
                                            <option key={p.id} value={p.id}>
                                                [{p.priority_level}] {p.patient_name} {p.status === 'in_treatment' ? '• Bedded' : '• In Triage'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-muted-foreground mb-1 block">Quantity</label>
                                    <div className="flex items-center gap-3">
                                        <Button variant="outline" className="w-10 h-10 font-mono text-lg" onClick={() => setDispenseAmount(Math.max(1, dispenseAmount - 1))}>-</Button>
                                        <input
                                            type="number"
                                            value={dispenseAmount}
                                            onChange={(e) => setDispenseAmount(parseInt(e.target.value) || 1)}
                                            className="h-10 flex-1 text-center font-mono font-bold border border-border rounded-lg bg-background"
                                        />
                                        <Button variant="outline" className="w-10 h-10 font-mono text-lg" onClick={() => setDispenseAmount(Math.min(dispenseMed.quantity, dispenseAmount + 1))}>+</Button>
                                    </div>
                                    <p className="text-right text-[10px] text-muted-foreground mt-1 font-mono">Max: {dispenseMed.quantity} {dispenseMed.unit}</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => { setDispenseMed(null); setDispensePatient(""); }}>Cancel</Button>
                                <Button onClick={dispenseToPatient} disabled={!dispensePatient || dispenseAmount < 1 || dispenseAmount > dispenseMed.quantity} className="bg-primary shadow-lg shadow-primary/20 hover:bg-primary/90 text-white font-bold px-6">Dispense</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
