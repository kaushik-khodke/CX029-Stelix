import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { CalendarClock } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'

export function AdherenceReport() {
    const { user } = useAuth()
    const [adherenceData, setAdherenceData] = useState<{
        logs: any[],
        stats: {
            total: number,
            taken: number,
            missed: number,
            adherence_pct: number
        }
    } | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchAdherenceData = useCallback(async () => {
        if (!user?.id) return
        setLoading(true)
        try {
            const res = await fetch(`${API_BASE_URL}/adherence-report?patient_id=${user.id}`)
            const data = await res.json()
            if (data.success) {
                setAdherenceData(data)
            }
        } catch (e) {
            console.error("Adherence report fetch failed:", e)
        } finally {
            setLoading(false)
        }
    }, [user?.id])

    useEffect(() => {
        fetchAdherenceData()
    }, [fetchAdherenceData])

    if (loading && !adherenceData) return (
        <div className="flex items-center justify-center p-8 bg-white/50 rounded-2xl border border-slate-100 animate-pulse">
            <span className="text-slate-400 font-medium">Loading reports...</span>
        </div>
    )

    return (
        <div className="mt-8 overflow-hidden">
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-blue-600 mb-4 flex items-center gap-2">
                <CalendarClock className="w-6 h-6 text-indigo-600" />
                Medication Consistency
            </h3>

            {adherenceData && adherenceData.stats.total > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="rounded-2xl border-none shadow-sm bg-white/80 backdrop-blur-sm overflow-hidden">
                        <CardContent className="p-5 flex flex-col items-center justify-center">
                            <h4 className="font-semibold text-slate-700 mb-4 w-full text-left">Dose Consistency</h4>
                            <div className="h-48 w-full flex items-center justify-center relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Taken', value: adherenceData.stats.taken },
                                                { name: 'Missed', value: adherenceData.stats.missed },
                                            ]}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell fill="#10b981" />
                                            <Cell fill="#f43f5e" />
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-black text-slate-800">{adherenceData.stats.adherence_pct}%</span>
                                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Adherence</span>
                                </div>
                            </div>
                            <div className="flex gap-4 mt-2 text-sm justify-center">
                                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div> {adherenceData.stats.taken} Taken</span>
                                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-200"></div> {adherenceData.stats.missed} Missed</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-none shadow-sm bg-white/80 backdrop-blur-sm overflow-hidden">
                        <CardContent className="p-5">
                            <h4 className="font-semibold text-slate-700 mb-4">Cumulative Routine Trend</h4>
                            <div className="h-48 w-full -ml-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={
                                        (() => {
                                            let count = 0;
                                            return (adherenceData.logs || []).slice(-14).map((l: any) => {
                                                count += (l.status === 'taken' ? 1 : 0);
                                                const date = new Date(l.created_at);
                                                const label = date.toLocaleDateString('en-US', { 
                                                    month: 'short', 
                                                    day: 'numeric' 
                                                }) + ' ' + date.toLocaleTimeString('en-US', { 
                                                    hour: '2-digit', 
                                                    minute: '2-digit',
                                                    hour12: true 
                                                });
                                                return { day: label, taken: count };
                                            });
                                        })()
                                    }>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis 
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 8, fill: '#94a3b8' }} 
                                            dy={5}
                                        />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Line type="monotone" dataKey="taken" stroke="#4f46e5" strokeWidth={3} dot={{ strokeWidth: 2, r: 4, fill: '#fff' }} activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="bg-white/50 dark:bg-muted/20 border border-slate-100 dark:border-border/50 p-8 rounded-2xl text-center text-slate-500 dark:text-muted-foreground">
                    No medicine adherence data recorded yet.
                </div>
            )}
        </div>
    )
}
