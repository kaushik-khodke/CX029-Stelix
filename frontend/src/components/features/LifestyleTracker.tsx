import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Droplet, Footprints, Moon, Activity, Flame, HeartPulse } from "lucide-react";
import { motion } from "framer-motion";

export function LifestyleTracker() {
    const { user } = useAuth();
    
    // States for display
    const [hydration, setHydration] = useState(0);
    const [steps, setSteps] = useState(0);
    const [sleep, setSleep] = useState<number | null>(null);
    const [bp, setBp] = useState<string>('');
    const [loading, setLoading] = useState(true);

    // Inputs
    const [inputSteps, setInputSteps] = useState('');
    const [inputSleep, setInputSleep] = useState('');
    const [inputBp, setInputBp] = useState('');

    useEffect(() => {
        if (user) {
            fetchTodayRoutines();
        }
        
        // Listen for external updates (e.g. from DailyAgenda)
        const handleExternalUpdate = () => {
            fetchTodayRoutines();
        };
        window.addEventListener('routine-updated', handleExternalUpdate);
        return () => window.removeEventListener('routine-updated', handleExternalUpdate);
    }, [user]);

    const fetchTodayRoutines = async () => {
        setLoading(true);
        try {
            const today = new Date();
            today.setHours(0,0,0,0);

            const { data, error } = await supabase
                .from('health_routines')
                .select('*')
                .eq('user_id', user!.id)
                .gte('logged_at', today.toISOString());

            if (error) throw error;

            let water = 0;
            let stepsCount = 0;
            let sleepHours: number | null = null;
            let currentBp = '';

            data?.forEach(log => {
                if (log.metric_type === 'hydration') water += parseInt(log.value);
                if (log.metric_type === 'steps') stepsCount += parseInt(log.value);
                if (log.metric_type === 'sleep') sleepHours = parseFloat(log.value);
                if (log.metric_type === 'blood_pressure') currentBp = log.value;
            });

            setHydration(water);
            setSteps(stepsCount);
            setSleep(sleepHours);
            setBp(currentBp);

        } catch (err) {
            console.error("Error fetching routines:", err);
        } finally {
            setLoading(false);
        }
    };

    const logMetric = async (type: string, value: string, unit: string) => {
        if (!value) return;
        
        try {
            const { error } = await supabase.from('health_routines').insert({
                user_id: user!.id,
                metric_type: type,
                value: value,
                unit: unit
            });

            if (error) throw error;
            
            // Optimistic update
            if (type === 'hydration') setHydration(prev => prev + parseInt(value));
            if (type === 'steps') { setSteps(prev => prev + parseInt(value)); setInputSteps(''); }
            if (type === 'sleep') { setSleep(parseFloat(value)); setInputSleep(''); }
            if (type === 'blood_pressure') { setBp(value); setInputBp(''); }

            // Notify other components (e.g. DailyAgenda)
            window.dispatchEvent(new CustomEvent('routine-updated'));
        } catch (err) {
            alert("Error logging routine, please ensure schema exists.");
            console.error(err);
        }
    };

    if (loading) {
        return (
            <Card className="glass-card shadow-lg border-border/50 animate-pulse h-48 flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary animate-spin" />
            </Card>
        );
    }

    return (
        <Card className="glass-card shadow-lg border-border/50 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-emerald-800 dark:text-emerald-300">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Lifestyle & Vitals Log
                </CardTitle>
            </CardHeader>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Hydration */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold">
                            <Droplet className="w-5 h-5" /> Hydration
                        </div>
                        <span className="text-xl font-bold font-heading text-blue-900 dark:text-blue-200">{hydration} / 8</span>
                    </div>
                    <div className="flex gap-2 items-center mt-2">
                        <div className="flex-1 h-3 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-blue-500" 
                                initial={{ width: 0 }} 
                                animate={{ width: `${Math.min((hydration / 8) * 100, 100)}%` }} 
                            />
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-100" onClick={() => logMetric('hydration', '1', 'glasses')}>+1 Glass</Button>
                    </div>
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                            <Footprints className="w-5 h-5" /> Daily Steps
                        </div>
                        <span className="text-xl font-bold font-heading text-emerald-900 dark:text-emerald-200">{steps}</span>
                    </div>
                    <div className="flex gap-2 items-center mt-2">
                        <Input 
                            type="number" 
                            min="0"
                            placeholder="Add steps..." 
                            className="h-8 text-xs font-medium border-emerald-200 focus-visible:ring-emerald-500 bg-white" 
                            value={inputSteps} 
                            onChange={(e) => setInputSteps(e.target.value)} 
                        />
                        <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => logMetric('steps', inputSteps, 'steps')}>Log</Button>
                    </div>
                </div>

                {/* Sleep */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold">
                            <Moon className="w-5 h-5" /> Sleep Duration
                        </div>
                        <span className="text-xl font-bold font-heading text-indigo-900 dark:text-indigo-200">{sleep !== null ? `${sleep} hr` : '---'}</span>
                    </div>
                    <div className="flex gap-2 items-center mt-2">
                        <Input 
                            type="number" 
                            min="0"
                            step="0.5"
                            placeholder="Hours slept..." 
                            className="h-8 text-xs font-medium border-indigo-200 bg-white" 
                            value={inputSleep} 
                            onChange={(e) => setInputSleep(e.target.value)} 
                        />
                        <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700" onClick={() => logMetric('sleep', inputSleep, 'hours')}>Save</Button>
                    </div>
                </div>

                {/* Blood Pressure */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold">
                            <HeartPulse className="w-5 h-5" /> Blood Pressure
                        </div>
                        <span className="text-xl font-bold font-heading text-rose-900 dark:text-rose-200">{bp || '---'}</span>
                    </div>
                    <div className="flex gap-2 items-center mt-2">
                        <Input 
                            type="text" 
                            placeholder="e.g. 120/80" 
                            className="h-8 text-xs font-medium border-rose-200 bg-white" 
                            value={inputBp} 
                            onChange={(e) => setInputBp(e.target.value)} 
                        />
                        <Button size="sm" className="h-8 bg-rose-600 hover:bg-rose-700" onClick={() => logMetric('blood_pressure', inputBp, 'mmHg')}>Log BP</Button>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}
