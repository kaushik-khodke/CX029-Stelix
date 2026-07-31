import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Mic,
    Bot,
    StopCircle,
    Activity,
    BrainCircuit,
    ChevronDown,
    ChevronUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE_URL } from '@/lib/api'

interface Message {
    id: string
    text: string
    isUser: boolean
    timestamp: string
    steps?: { agent: string; message: string; success: boolean }[]
}

function VoiceWaveform() {
    return (
        <div className="flex items-center gap-[4px] h-12">
            {[...Array(5)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-[5px] bg-white rounded-full shadow-sm"
                    animate={{
                        height: ['20%', `${40 + Math.random() * 60}%`, '20%'],
                    }}
                    transition={{
                        duration: 0.7 + Math.random() * 0.3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.1,
                    }}
                />
            ))}
        </div>
    )
}

export function PharmacistAI({ isOpen, onToggle }: { isOpen: boolean, onToggle: () => void }) {
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en')

    // Voice states
    const [isListening, setIsListening] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
    const [voiceError, setVoiceError] = useState<string | null>(null)

    const recognitionRef = useRef<any>(null)
    const shouldListenRef = useRef(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isOpen])

    const startListening = () => {
        setVoiceError(null)
        if (!shouldListenRef.current) setInputValue('')
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setVoiceError('Voice input not supported.')
            return
        }

        shouldListenRef.current = true
        setIsListening(true)
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true

        const langMap = { 'en': 'en-US', 'hi': 'hi-IN', 'mr': 'mr-IN' }
        recognition.lang = langMap[language] || 'en-US'

        recognition.onresult = (event: any) => {
            let currentText = ''
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                currentText += event.results[i][0].transcript
            }
            if (currentText) setInputValue(currentText)
        }

        recognition.onerror = (event: any) => {
            setIsListening(false)
            setVoiceError(`Voice error: ${event.error}`)
        }

        recognition.onend = () => {
            if (shouldListenRef.current) {
                setTimeout(() => recognition.start(), 100)
            } else {
                setIsListening(false)
            }
        }

        recognitionRef.current = recognition
        recognition.start()
    }

    const stopListening = () => {
        shouldListenRef.current = false
        if (recognitionRef.current) {
            recognitionRef.current.stop()
            setIsListening(false)
        }
    }

    const playBase64Audio = (base64Data: string) => {
        try {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = "";
            }

            const audio = new Audio(`data:audio/mp3;base64,${base64Data}`);
            setCurrentAudio(audio);

            audio.onplay = () => setIsSpeaking(true);
            audio.onended = () => {
                setIsSpeaking(false);
                setCurrentAudio(null);
            };
            audio.onerror = (e) => {
                console.error("Audio playback error:", e);
                setIsSpeaking(false);
                setCurrentAudio(null);
            };

            audio.play();
        } catch (error) {
            console.error("Failed to play base64 audio:", error);
            setIsSpeaking(false);
        }
    };

    const stopSpeaking = () => {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = "";
            setCurrentAudio(null);
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
    };

    const speakText = (text: string, base64Audio?: string) => {
        if (base64Audio) {
            playBase64Audio(base64Audio);
            return;
        }

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
            const cleanText = text.replace(/[#*_-]/g, '').trim()
            const utterance = new SpeechSynthesisUtterance(cleanText)
            utterance.lang = 'en-US'
            utterance.onstart = () => setIsSpeaking(true)
            utterance.onend = () => setIsSpeaking(false)
            window.speechSynthesis.speak(utterance)
        }
    }

    const handleSendMessage = async (overrideText?: string) => {
        stopListening()
        const textToSend = overrideText || inputValue
        if (!textToSend.trim()) return

        const newMessage = {
            id: Date.now().toString(),
            text: textToSend,
            isUser: true,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, newMessage])
        setInputValue('')
        setIsLoading(true)

        try {
            const response = await fetch(`${API_BASE_URL}/pharmacist/ai-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: textToSend,
                    use_voice: true, // Always request high-quality audio
                    language: language,
                }),
            })
            const result = await response.json()
            if (result.success) {
                const aiMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    text: result.response,
                    isUser: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    steps: result.steps
                }
                setMessages(prev => [...prev, aiMessage])
                speakText(result.response, result.audio_data)
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    text: `⚠️ ${result.response || result.error || "I'm having trouble analyzing the store dataset."}`,
                    isUser: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }])
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                text: "❌ Service connection failed. Please ensure the backend is running.",
                isUser: false,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const quickActions = [
        { text: 'Analyze daily sales trends', icon: '📈' },
        { text: 'Which meds are running low?', icon: '⚠️' },
        { text: 'Pending order summary', icon: '📋' },
    ]

    const MarkdownComponents = {
        h3: ({ node, ...props }: any) => (
            <div className="flex items-center gap-2 mt-4 mb-2 font-semibold text-base text-[#B02BE0] border-b border-slate-100 pb-1">
                <Activity className="w-4 h-4" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-2 mb-4 text-[#3A3F45] text-[13px]" {...props} />,
        li: ({ node, ...props }: any) => <li className="leading-snug marker:text-[#B02BE0]" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-[#B02BE0]" {...props} />,
        p: ({ node, ...props }: any) => <p className="leading-relaxed mb-3 text-[#3A3F45] text-[13px]" {...props} />,
    }

    if (!isOpen) return null;

    return (
        <Card className="fixed bottom-6 right-6 w-[420px] h-[640px] flex flex-col shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-[24px] overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl z-50 perspective-1000">
            {/* Futurisic Glow Effect */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-40 h-40 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-40 h-40 bg-teal-500/20 blur-[80px] rounded-full pointer-events-none" />

            <CardHeader className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-500 p-5 shrink-0 relative z-10 shadow-lg border-b border-white/10">
                <div className="flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-white/20 blur-md rounded-full animate-pulse" />
                            <div className="relative w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                                <BrainCircuit className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <CardTitle className="text-base font-bold tracking-tight text-white drop-shadow-sm">Store Analyst</CardTitle>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-100/80">Quantum Engine Active</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative group">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value as any)}
                                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg px-2 py-1 text-[11px] font-bold outline-none cursor-pointer transition-all appearance-none text-center min-w-[45px] backdrop-blur-sm"
                            >
                                <option value="en" className="text-slate-900">EN</option>
                                <option value="hi" className="text-slate-900">HI</option>
                                <option value="mr" className="text-slate-900">MR</option>
                            </select>
                            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2 h-2 pointer-events-none opacity-50" />
                        </div>
                        
                        {isSpeaking && (
                            <Button variant="ghost" size="sm" onClick={stopSpeaking} className="h-8 w-8 p-0 text-white hover:bg-white/20 rounded-xl transition-all relative">
                                <span className="absolute inset-0 rounded-xl border-2 border-white/40 animate-ping"></span>
                                <StopCircle className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onToggle} className="h-8 w-8 p-0 text-white hover:bg-white/20 rounded-xl transition-all">
                            <ChevronDown className="w-5 h-5 drop-shadow-sm" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <AnimatePresence>
                {isListening && (
                    <motion.div
                        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
                        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                        className="absolute inset-0 z-50 bg-indigo-950/80 flex flex-col items-center justify-center p-8 text-center mt-[80px]"
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-teal-500/30 blur-3xl rounded-full scale-150 animate-pulse" />
                            <VoiceWaveform />
                        </div>
                        <h3 className="text-2xl font-black mt-10 text-white tracking-tight uppercase italic">Synthesizing...</h3>
                        <p className="text-teal-200/70 mt-3 text-sm font-medium tracking-wide">Ready for your data directive</p>
                        
                        <AnimatePresence>
                            {inputValue && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-8 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md shadow-2xl max-w-[90%]"
                                >
                                    <p className="text-sm italic text-teal-100 line-clamp-3 font-medium leading-relaxed">"{inputValue}"</p>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {voiceError && (
                            <motion.p 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-red-400 mt-6 text-xs font-bold bg-red-950/40 border border-red-500/30 px-4 py-2 rounded-xl backdrop-blur-md"
                            >
                                ERROR: {voiceError}
                            </motion.p>
                        )}

                        <div className="mt-12 flex gap-4 relative z-10 w-full px-4">
                            <Button variant="outline" onClick={stopListening} className="flex-1 rounded-2xl h-12 border-white/10 bg-white/5 text-white hover:bg-white/10 font-bold uppercase tracking-widest text-[10px]">Terminate</Button>
                            <Button onClick={() => handleSendMessage()} className="flex-1 rounded-2xl h-12 bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-slate-900 font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(45,212,191,0.4)]">Process</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent scrollbar-none custom-scrollbar pb-10">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="relative mb-8"
                        >
                            <div className="absolute inset-0 bg-violet-500/10 blur-[50px] rounded-full scale-150" />
                            <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 rounded-3xl flex items-center justify-center relative border border-white/60 dark:border-slate-800 shadow-xl">
                                <Bot className="w-10 h-10 text-violet-600 dark:text-violet-400" />
                            </div>
                        </motion.div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic mb-2">Neural Interface Online</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10 max-w-[280px] leading-relaxed font-medium">Accessing real-time pharmacy analytics, ML insights, and secure database protocols.</p>

                        <div className="grid grid-cols-1 gap-3 w-full">
                            {quickActions.map((action, i) => (
                                <motion.button
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                                    key={i}
                                    onClick={() => handleSendMessage(action.text)}
                                    className="group p-4 rounded-[20px] border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 hover:border-violet-500/50 hover:bg-violet-50 dark:hover:bg-violet-900/10 hover:translate-x-1 transition-all text-left shadow-sm hover:shadow-md backdrop-blur-sm"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xl group-hover:scale-110 group-hover:bg-white transition-all shadow-inner">
                                            {action.icon}
                                        </div>
                                        <span className="text-sm text-slate-700 dark:text-slate-300 font-bold group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors uppercase tracking-tight">{action.text}</span>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m) => (
                    <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                        className={`flex gap-3 relative ${m.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        {!m.isUser && (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg border border-white/20">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                        )}
                        <div
                            className={`max-w-[85%] text-[14px] leading-relaxed relative ${m.isUser
                                ? 'bg-gradient-to-br from-violet-600 to-purple-500 text-white px-5 py-3 rounded-[24px] rounded-tr-[4px] shadow-xl shadow-purple-500/10 font-medium'
                                : 'text-slate-800 dark:text-slate-200 bg-white/40 dark:bg-slate-800/40 p-5 rounded-[24px] rounded-tl-[4px] border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-md shadow-sm'
                                }`}
                        >
                            <div className={`prose prose-sm max-w-none ${m.isUser ? 'text-white' : 'dark:prose-invert'}`}>
                                {m.isUser ? (
                                    <p className="m-0 font-medium leading-relaxed">{m.text}</p>
                                ) : (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                )}
                            </div>

                            {!m.isUser && m.steps && m.steps.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                                    <details className="group">
                                        <summary className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-500 dark:text-violet-400 cursor-pointer hover:opacity-80 transition-opacity list-none flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                            Chain of Thought Protocol
                                            <ChevronDown className="ml-auto w-3 h-3 group-open:rotate-180 transition-transform" />
                                        </summary>
                                        <div className="mt-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                                            {m.steps?.map((s, idx) => (
                                                <div key={idx} className="flex gap-3 items-start relative pb-3 last:pb-0">
                                                    {idx < m.steps!.length - 1 && (
                                                        <div className="absolute left-1.5 top-5 bottom-0 w-[1px] bg-slate-200 dark:border-slate-800" />
                                                    )}
                                                    <div className={`mt-1.5 w-3 h-3 rounded-full shrink-0 border-2 border-white dark:border-slate-900 shadow-sm ${s.agent === 'thought' ? 'bg-amber-400' : 'bg-teal-400'}`} />
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                            {s.agent === 'thought' ? 'Core Subconscious' : `Protocol: ${s.agent}`}
                                                        </span>
                                                        <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug font-medium italic">"{s.message}"</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}

                {isLoading && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 justify-start items-center ml-1">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg animate-pulse">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex gap-2 items-center bg-white/40 dark:bg-slate-800/40 px-5 py-4 rounded-[20px] rounded-tl-[4px] border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-md">
                            <div className="flex gap-1">
                                {[0, 150, 300].map((delay) => (
                                    <motion.span 
                                        key={delay}
                                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                                        transition={{ duration: 1, repeat: Infinity, delay: delay/1000 }}
                                        className="w-1.5 h-1.5 bg-violet-600 rounded-full" 
                                    />
                                ))}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 ml-2">Analyzing</span>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </CardContent>

            <div className="p-6 pt-2 bg-transparent shrink-0 relative z-10 rounded-b-[24px]">
                <div className="relative group">
                    <div className="absolute inset-0 bg-violet-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full" />
                    <div className="relative flex gap-3 items-center bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-2 pl-4 rounded-[24px] shadow-2xl focus-within:border-violet-500/50 transition-all">
                        <Button
                            title="Direct Vocal Link"
                            variant="ghost"
                            onClick={startListening}
                            className={`rounded-2xl w-10 h-10 p-0 shrink-0 transition-all ${isListening
                                ? 'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                                : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                                }`}
                        >
                            {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </Button>
                        
                        <Input
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Input command sequence..."
                            className="flex-1 bg-transparent border-0 focus-visible:ring-0 h-10 text-slate-700 dark:text-slate-200 text-sm font-bold placeholder:text-slate-400 placeholder:italic dark:placeholder:text-slate-600 shadow-none"
                        />
                        
                        <Button
                            onClick={() => handleSendMessage()}
                            disabled={!inputValue.trim() || isLoading}
                            className="rounded-2xl w-10 h-10 p-0 bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/20 text-white disabled:opacity-30 transition-all shrink-0 border-0"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <div className="mt-3 text-center">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-600 mix-blend-multiply dark:mix-blend-screen">Authorized Analyst Access Only</span>
                </div>
            </div>
        </Card>
    )
}
