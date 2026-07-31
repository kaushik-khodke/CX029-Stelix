import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { X, Mic, MicOff, Loader2, Activity, ShieldAlert, FileText, Users } from "lucide-react";
import { motion } from "framer-motion";
import { API_BASE_URL } from "@/lib/api";

interface TriageAssessmentModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function TriageAssessmentModal({ onClose, onSuccess }: TriageAssessmentModalProps) {
    const [patientId, setPatientId] = useState("");
    const [patientName, setPatientName] = useState("");
    const [patients, setPatients] = useState<{ id: string, full_name: string }[]>([]);
    const [loadingPatients, setLoadingPatients] = useState(true);
    const [vitals, setVitals] = useState({ hr: "", bp: "", spo2: "", temp: "" });
    const [symptoms, setSymptoms] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const fetchPatients = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/patients`);

                if (!res.ok) {
                    throw new Error("Failed to load patients from backend");
                }

                const data = await res.json();
                setPatients(data || []);
            } catch (err: any) {
                console.error("Error fetching patients:", err);
                setError("Failed to load patients list.");
            } finally {
                setLoadingPatients(false);
            }
        };

        fetchPatients();
    }, []);

    const toggleVoiceInput = () => {
        if (isListening) {
            if (recognitionRef.current) recognitionRef.current.stop();
            setIsListening(false);
            return;
        }

        try {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                setError("Speech recognition is not supported in this browser.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US"; // Could be made dynamic based on localization

            recognition.onresult = (event: any) => {
                let currentTranscript = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        currentTranscript += event.results[i][0].transcript + " ";
                    }
                }
                if (currentTranscript) {
                    setSymptoms((prev) => (prev + " " + currentTranscript).trim());
                }
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognition.start();
            recognitionRef.current = recognition;
            setIsListening(true);
        } catch (err: any) {
            setError("Failed to start speech recognition.");
        }
    };

    const calculateUrgency = async () => {
        if (!patientName || !symptoms) {
            setError("Patient Name and Symptoms are required.");
            return;
        }

        setIsSubmitting(true);
        setError("");

        try {
            // Get hospital user
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Not authenticated");

            // We need a backend API endpoint to call Gemini for triage analysis.
            // Since the frontend is talking to the FastAPI backend, we call it directly.
            const res = await fetch(`${API_BASE_URL}/triage/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vitals,
                    symptoms,
                    patient_id: patientId || null,
                    history: "No IPFS history attached for this emergency check-in (Anonymous/Manual Entry)."
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to analyze triage");
            }

            const aiResult = await res.json();
            // Expecting: { priority_level, confidence_score, clinical_reasoning }

            // Insert into Supabase queue
            const { error: dbError } = await supabase.from("triage_queue").insert({
                patient_id: patientId || null,
                patient_name: patientName,
                hospital_id: userData.user.id,
                vitals,
                symptoms,
                priority_level: aiResult.priority_level,
                ai_confidence: aiResult.confidence_score,
                ai_reasoning: aiResult.clinical_reasoning,
                status: "waiting"
            });

            if (dbError) throw dbError;

            onSuccess();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "An error occurred during triage calculation.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl bg-card border border-border/50 shadow-2xl rounded-2xl overflow-hidden shadow-primary/10"
            >
                <div className="flex items-center justify-between p-6 border-b border-border/50 bg-muted/5 relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-teal-500/50 to-primary/50" />
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                            <ShieldAlert className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black font-heading tracking-tight text-foreground">AI Triage</h2>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Digital Clinical Assessment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Patient Identity</label>
                        <div className="relative group">
                            <select
                                value={patientId}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    setPatientId(id);
                                    const patient = patients.find(p => p.id === id);
                                    setPatientName(patient ? patient.full_name : "");
                                }}
                                className="w-full h-12 rounded-2xl border border-input bg-muted/10 px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all appearance-none cursor-pointer"
                                disabled={loadingPatients}
                            >
                                <option value="">Select a registered patient...</option>
                                {patients.map((patient) => (
                                    <option key={patient.id} value={patient.id}>
                                        {patient.full_name}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                {loadingPatients ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-primary" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Biometric Vital Signs</h3>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Heart Rate</label>
                                <div className="relative">
                                    <Input value={vitals.hr} onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} placeholder="85" className="h-11 bg-muted/10 border-border/50 rounded-xl pl-3 pr-10" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40">BPM</span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">BP</label>
                                <div className="relative">
                                    <Input value={vitals.bp} onChange={(e) => setVitals({ ...vitals, bp: e.target.value })} placeholder="120/80" className="h-11 bg-muted/10 border-border/50 rounded-xl pl-3 pr-12" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40">mmHg</span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">SpO2</label>
                                <div className="relative">
                                    <Input value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} placeholder="98" className="h-11 bg-muted/10 border-border/50 rounded-xl pl-3 pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40">%</span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Temp</label>
                                <div className="relative">
                                    <Input value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} placeholder="98.6" className="h-11 bg-muted/10 border-border/50 rounded-xl pl-3 pr-8" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40">°F</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-primary" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Symptoms & Chief Complaint</h3>
                        </div>
                        <div className="relative group">
                            <textarea
                                value={symptoms}
                                onChange={(e) => setSymptoms(e.target.value)}
                                placeholder="Describe the patient's symptoms... Use voice for hands-free entry."
                                className="w-full min-h-[140px] rounded-2xl border border-input bg-muted/20 px-4 py-4 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all resize-none shadow-inner"
                            />

                            <div className="absolute bottom-3 right-3 flex items-center gap-2">
                                {isListening && (
                                    <div className="flex gap-1 h-4 items-center px-2">
                                        {[1, 2, 3].map(i => (
                                            <motion.div
                                                key={i}
                                                animate={{ height: ["20%", "100%", "20%"] }}
                                                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                                className="w-1 bg-red-500 rounded-full"
                                            />
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleVoiceInput}
                                    className={`p-3 rounded-2xl transition-all shadow-lg flex items-center justify-center ${isListening
                                        ? "bg-red-500 text-white shadow-red-500/30 ring-4 ring-red-500/20"
                                        : "bg-primary text-white hover:bg-primary/90 shadow-primary/30 hover:scale-105"
                                        }`}
                                >
                                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        {isListening && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[10px] text-red-500 font-bold uppercase tracking-widest ml-1 flex items-center gap-1"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                Monitoring Audio...
                            </motion.p>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-border/50 bg-muted/10 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={calculateUrgency} disabled={isSubmitting} className="gradient-primary gap-2 min-w-[160px]">
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                        {isSubmitting ? "Calculating..." : "Calculate Urgency"}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
