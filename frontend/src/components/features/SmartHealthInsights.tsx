import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE_URL } from "@/lib/api";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function SmartHealthInsights() {
    const { user } = useAuth();
    const [insight, setInsight] = useState<string>("Analyzing your health logs...");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            const cacheKey = `health_insight_${user.id}`;
            const cachedDataStr = localStorage.getItem(cacheKey);
            if (cachedDataStr) {
                const cached = JSON.parse(cachedDataStr);
                // Cache valid for 3 hours
                if (Date.now() - cached.timestamp < 10800000) {
                    setInsight(cached.insight);
                    setLoading(false);
                    return;
                }
            }
            setLoading(false);
            setInsight("Ready to analyze your routines. Click to generate new insights.");
        }
    }, [user]);

    const fetchInsight = async () => {
        try {
        setLoading(true);

            const res = await fetch(`${API_BASE_URL}/patient/smart-insights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user!.id })
            });
            
            const data = await res.json();
            const cacheKey = `health_insight_${user!.id}`;
            const cachedDataStr = localStorage.getItem(cacheKey);

            if (data.success) {
                setInsight(data.insight);
                localStorage.setItem(cacheKey, JSON.stringify({ 
                    insight: data.insight, 
                    timestamp: Date.now() 
                }));
            } else {
                // If rate limited, try to show the old cache even if expired
                if (cachedDataStr) {
                    setInsight(JSON.parse(cachedDataStr).insight);
                } else {
                    setInsight("Keep logging your habits to unlock personalized clinical insights!");
                }
            }
        } catch (err) {
            setInsight("Insight core offline. Start logging your doses and habits later!");
            console.error("AI Insight Error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="rounded-2xl overflow-hidden border-none shadow-[0_4px_24px_rgba(139,92,246,0.15)] relative bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/20 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-cyan-400/20 blur-3xl rounded-full pointer-events-none" />
            
            <CardContent className="p-6 relative z-10">
                <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-white/30 rounded-xl blur-md animate-pulse" />
                        <div className="relative w-12 h-12 bg-white/20 border border-white/30 rounded-xl flex items-center justify-center shadow-inner backdrop-blur-md">
                            <Sparkles className="w-6 h-6 text-white drop-shadow-sm" />
                        </div>
                    </div>
                    
                    <div className="flex-1">
                        <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white/80 mb-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                            AI Health Correlation
                        </h4>
                        
                        {loading ? (
                            <div className="space-y-2 mt-3">
                                <div className="h-4 w-3/4 bg-white/20 rounded-md animate-pulse" />
                                <div className="h-4 w-1/2 bg-white/20 rounded-md animate-pulse" />
                            </div>
                        ) : (
                            <div>
                                <motion.p 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-white text-sm leading-relaxed font-medium mt-1 drop-shadow-sm mb-3"
                                >
                                    {insight}
                                </motion.p>
                                <button 
                                    onClick={fetchInsight}
                                    className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 font-medium"
                                >
                                    <Sparkles className="w-3 h-3" /> Generate Insights
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
