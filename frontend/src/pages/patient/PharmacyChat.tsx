import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Mic,
    Bot,
    StopCircle,
    ShieldCheck,
    Pill,
    Sparkles,
    Stethoscope,
    PackageSearch,
    RefreshCw,
    Activity,
    BrainCircuit
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/hooks/useAuth'
import { API_BASE_URL } from '@/lib/api'

interface Message {
    id: string
    text: string
    isUser: boolean
    timestamp: string
}

function VoiceWaveform() {
    return (
        <div className="flex items-center gap-1.5 h-16">
            {[...Array(7)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1.5 bg-gradient-to-t from-indigo-400 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    animate={{
                        height: ['20%', `${40 + Math.random() * 60}%`, '20%'],
                    }}
                    transition={{
                        duration: 0.6 + Math.random() * 0.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.1,
                    }}
                />
            ))}
        </div>
    )
}

function TypingIndicator() {
    return (
        <div className="flex gap-1.5 items-center px-2 py-1">
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-500/60"
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.2,
                    }}
                />
            ))}
        </div>
    )
}

export function PharmacyChat() {
    const { i18n } = useTranslation()
    const { user } = useAuth()

    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)

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
    }, [messages, isLoading])

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
        recognition.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'

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
            utterance.lang = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'mr' ? 'mr-IN' : 'en-US'
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
            const response = await fetch(`${API_BASE_URL}/pharmacy/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: textToSend,
                    patient_id: user?.id,
                    language: i18n.language || 'en',
                    use_voice: true, // Always request high-quality audio
                }),
            })
            const result = await response.json()
            if (result.success) {
                const aiMessage = {
                    id: (Date.now() + 1).toString(),
                    text: result.response,
                    isUser: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }
                setMessages(prev => [...prev, aiMessage])
                speakText(result.response, result.audio_data)
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    text: `⚠️ ${result.response || result.error || "I'm having trouble connecting to pharmacy records. Please try again."}`,
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
        { text: 'Medicines for Cough', icon: <Stethoscope className="w-6 h-6 text-indigo-500" />, desc: 'Common cold & cough remedies' },
        { text: 'Check Paracetamol Stock', icon: <PackageSearch className="w-6 h-6 text-amber-500" />, desc: 'Availability at nearby pharmacies' },
        { text: 'Refill My Meds', icon: <RefreshCw className="w-6 h-6 text-emerald-500" />, desc: 'Request prescription refill' },
        { text: 'Side Effects Query', icon: <Activity className="w-6 h-6 text-rose-500" />, desc: 'Check medication interactions' },
    ]

    const MarkdownComponents = {
        h3: ({ node, ...props }: any) => (
            <div className="flex items-center gap-2 mt-5 mb-3 font-bold text-lg text-indigo-700 dark:text-indigo-300 border-b border-indigo-500/10 pb-2">
                <Sparkles className="w-5 h-5 text-indigo-500" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-2 mb-4 marker:text-indigo-500" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-indigo-900 dark:text-indigo-200 bg-indigo-500/10 px-1.5 py-0.5 rounded-md" {...props} />,
        p: ({ node, ...props }: any) => <p className="mb-3 leading-relaxed" {...props} />,
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-4 md:p-6 bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-5xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
                <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 flex items-center justify-center shadow-xl shadow-indigo-500/30">
                        <div className="absolute inset-0 bg-white/20 rounded-2xl animate-pulse" />
                        <BrainCircuit className="w-8 h-8 text-white relative z-10" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            Expert Pharmacy Agent
                        </h1>
                        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Clinical Pharmacist AI Companion
                        </p>
                    </div>
                </div>
                {isSpeaking && (
                    <Button
                        variant="outline"
                        onClick={stopSpeaking}
                        className="animate-pulse border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 gap-2 rounded-full shadow-sm"
                    >
                        <StopCircle className="w-4 h-4" /> Stop Audio
                    </Button>
                )}
            </motion.div>

            {/* Chat Container */}
            <Card className="w-full max-w-5xl h-[calc(100vh-12rem)] flex flex-col shadow-2xl shadow-indigo-900/5 dark:shadow-black/50 rounded-3xl overflow-hidden border-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl relative ring-1 ring-slate-200 dark:ring-slate-800">
                <AnimatePresence>
                    {isListening && (
                        <motion.div
                            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
                            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                            className="absolute inset-0 z-50 bg-white/60 dark:bg-slate-950/60 flex flex-col items-center justify-center p-6 text-center"
                        >
                            <div className="w-32 h-32 rounded-full bg-indigo-500/10 flex items-center justify-center mb-8 relative">
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                                <Mic className="w-12 h-12 text-indigo-600 animate-pulse" />
                            </div>
                            <VoiceWaveform />
                            <h3 className="text-3xl font-bold mt-8 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600">I'm listening...</h3>
                            <p className="text-muted-foreground mt-3 text-lg">Describe your symptoms or ask about medicines</p>
                            {voiceError && <p className="text-rose-500 mt-4 font-medium px-4 py-2 bg-rose-50 rounded-lg">{voiceError}</p>}
                            <div className="mt-10 flex gap-4">
                                <Button variant="outline" size="lg" onClick={stopListening} className="rounded-full px-8 h-14 text-base border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</Button>
                                <Button size="lg" onClick={() => handleSendMessage()} className="rounded-full px-10 h-14 text-base bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/25 border-0">Analyze Speech</Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CardContent className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.5, type: 'spring' }}
                                className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/50 dark:to-blue-900/50 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner rotate-3"
                            >
                                <Pill className="w-12 h-12 text-indigo-600 dark:text-indigo-400 -rotate-12" />
                            </motion.div>
                            <motion.h2 
                                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                                className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-4"
                            >
                                How can I assist you today?
                            </motion.h2>
                            <motion.p 
                                initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                                className="text-slate-500 dark:text-slate-400 mb-10 text-lg"
                            >
                                Get instant clinical advice, check medicine stocks, or understand side effects.
                            </motion.p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                                {quickActions.map((action, i) => (
                                    <motion.button 
                                        key={i} 
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 + (i * 0.1) }}
                                        onClick={() => handleSendMessage(action.text)} 
                                        className="p-5 rounded-3xl border border-slate-200/60 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/50 bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:shadow-indigo-500/5 transition-all text-left group flex gap-4 items-start"
                                    >
                                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 group-hover:scale-110 transition-transform group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/20">
                                            {action.icon}
                                        </div>
                                        <div>
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 block mb-1">{action.text}</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{action.desc}</span>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m) => (
                        <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
                            className={`flex gap-3 sm:gap-4 ${m.isUser ? 'justify-end' : 'justify-start'}`}
                        >
                            {!m.isUser && (
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20 self-end mb-6">
                                    <BrainCircuit className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                </div>
                            )}
                            <div className={`flex flex-col ${m.isUser ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
                                <div
                                    className={`px-5 py-4 sm:px-6 sm:py-5 shadow-sm relative group ${m.isUser
                                        ? 'bg-indigo-600 text-white rounded-[2rem] rounded-br-md'
                                        : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[2rem] rounded-bl-md shadow-xl shadow-slate-200/20 dark:shadow-none'
                                        }`}
                                >
                                    <div className={`prose prose-sm sm:prose-base max-w-none ${m.isUser ? 'prose-invert' : 'text-slate-700 dark:text-slate-300'}`}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                    </div>
                                </div>
                                <span className="text-[11px] font-medium text-slate-400 mt-2 px-2 uppercase tracking-wider">
                                    {m.isUser ? 'You' : 'Expert AI'} • {m.timestamp}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                    
                    {isLoading && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 justify-start">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 self-end mb-6 animate-pulse">
                                <BrainCircuit className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 dark:text-slate-500" />
                            </div>
                            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[2rem] rounded-bl-md px-6 py-5 shadow-sm flex items-center gap-3">
                                <span className="text-sm font-medium text-slate-500">Analyzing medical knowledge base</span>
                                <TypingIndicator />
                            </div>
                        </motion.div>
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </CardContent>

                <div className="p-4 sm:p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 z-10">
                    <div className="max-w-4xl mx-auto flex gap-2 sm:gap-3 items-end bg-slate-50 dark:bg-slate-950 p-2 rounded-[2rem] border border-slate-200/60 dark:border-slate-800 shadow-inner">
                        <Button
                            variant="ghost"
                            onClick={startListening}
                            className={`rounded-full w-12 h-12 sm:w-14 sm:h-14 p-0 shrink-0 transition-all duration-300 ${isListening
                                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30 scale-105'
                                : 'bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 shadow-sm'
                                }`}
                        >
                            {isListening ? <StopCircle className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
                        </Button>
                        <div className="flex-1 relative">
                            <Input
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Message Expert Pharmacy Agent..."
                                className="w-full bg-transparent border-0 h-12 sm:h-14 px-4 sm:px-6 focus-visible:ring-0 text-base sm:text-lg shadow-none"
                            />
                        </div>
                        <Button
                            onClick={() => handleSendMessage()}
                            disabled={!inputValue.trim() && !isListening}
                            className={`rounded-full w-12 h-12 sm:w-14 sm:h-14 p-0 shrink-0 transition-all duration-300 ${
                                inputValue.trim() 
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 scale-105' 
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                        >
                            <Send className={`w-5 h-5 sm:w-6 sm:h-6 ${inputValue.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''} transition-transform`} />
                        </Button>
                    </div>
                    <p className="text-center text-[10px] sm:text-xs text-slate-400 mt-3 font-medium">
                        AI can make mistakes. Consider verifying important clinical information.
                    </p>
                </div>
            </Card>
        </div>
    )
}
