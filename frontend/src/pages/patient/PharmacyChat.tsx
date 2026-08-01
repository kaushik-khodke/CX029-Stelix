import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Send,
    Mic,
    Bot,
    StopCircle,
    Pill,
    Stethoscope,
    PackageCheck,
    RefreshCw,
    Activity,
    Sparkles
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
        <div className="flex items-center gap-1.5 h-12">
            {[...Array(5)].map((_, i) => (
                <motion.div
                    key={i}
                    className="w-1.5 bg-gradient-to-t from-indigo-500 to-blue-500 rounded-full"
                    animate={{
                        height: ['20%', `${40 + Math.random() * 60}%`, '20%'],
                    }}
                    transition={{
                        duration: 0.8 + Math.random() * 0.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.1,
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
    }, [messages])

    const startListening = () => {
        setVoiceError(null)
        if (!shouldListenRef.current) setInputValue('')
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setVoiceError('Voice input not supported in your browser.')
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
                    use_voice: true,
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
        {
            title: 'Medicines for Cough',
            subtitle: 'Common cold & cough remedies',
            prompt: 'Medicines for Cough',
            icon: <Stethoscope className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
            iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
            borderColor: 'hover:border-indigo-400/50 dark:hover:border-indigo-500/50',
        },
        {
            title: 'Check Paracetamol Stock',
            subtitle: 'Availability at nearby pharmacies',
            prompt: 'Check Paracetamol Stock',
            icon: <PackageCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />,
            iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
            borderColor: 'hover:border-indigo-400/50 dark:hover:border-indigo-500/50',
        },
        {
            title: 'Refill My Meds',
            subtitle: 'Request prescription refill',
            prompt: 'Refill My Meds',
            icon: <RefreshCw className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
            iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
            borderColor: 'hover:border-emerald-400/50 dark:hover:border-emerald-500/50',
        },
        {
            title: 'Side Effects Query',
            subtitle: 'Check medication interactions',
            prompt: 'Side Effects Query',
            icon: <Activity className="w-6 h-6 text-rose-500 dark:text-rose-400" />,
            iconBg: 'bg-rose-50 dark:bg-rose-950/50',
            borderColor: 'hover:border-rose-400/50 dark:hover:border-rose-500/50',
        },
    ]

    const MarkdownComponents = {
        h3: ({ node, ...props }: any) => (
            <div className="flex items-center gap-2 mt-4 mb-2 font-bold text-lg text-indigo-600 dark:text-indigo-400 border-b border-indigo-100 dark:border-indigo-900/50 pb-1">
                <Pill className="w-5 h-5" /> <h3 {...props} />
            </div>
        ),
        ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 space-y-1 mb-4" {...props} />,
        strong: ({ node, ...props }: any) => <span className="font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded" {...props} />,
        a: ({ node, href, children, ...props }: any) => {
            const isPayLink = href?.includes('payment') || href?.includes('checkout') || href?.includes('pay') || (children && String(children).toLowerCase().includes('pay'));
            if (isPayLink) {
                return (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 my-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200 hover:shadow-lg hover:shadow-emerald-300 transform hover:-translate-y-0.5 transition-all cursor-pointer no-underline border border-emerald-400/30"
                        {...props}
                    >
                        💳 {children || 'Pay for Order'}
                        <span className="ml-1 text-xs bg-white/20 px-2 py-0.5 rounded-md font-semibold">Pay Now ➔</span>
                    </a>
                );
            }
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-indigo-600 underline hover:text-indigo-800 transition-colors"
                    {...props}
                >
                    {children}
                </a>
            );
        },
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col p-4 md:p-8 bg-slate-50/60 dark:bg-slate-950 max-w-7xl mx-auto w-full">
            {/* Header section matching exact design */}
            <motion.div
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full mb-6 flex items-center justify-between"
            >
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 border border-indigo-200/50 dark:border-indigo-500/30 flex items-center justify-center shadow-sm">
                        <Pill className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Expert Pharmacy Agent</h1>
                        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mt-0.5">
                            <Sparkles className="w-3.5 h-3.5" /> Clinical Pharmacist AI Companion
                        </p>
                    </div>
                </div>
                {isSpeaking && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopSpeaking}
                        className="animate-pulse border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 gap-2 rounded-full px-4"
                    >
                        <StopCircle className="w-4 h-4" /> Stop Audio
                    </Button>
                )}
            </motion.div>

            {/* Main Chat Container */}
            <Card className="w-full flex-1 flex flex-col shadow-xl shadow-slate-200/50 dark:shadow-none rounded-3xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl relative min-h-[620px]">
                <AnimatePresence>
                    {isListening && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
                        >
                            <VoiceWaveform />
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-6">Listening to your query...</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-md">Speak clearly about your symptom, medicine availability, or side effects.</p>
                            {voiceError && <p className="text-red-500 text-sm mt-2 font-medium">{voiceError}</p>}
                            <div className="mt-8 flex gap-3">
                                <Button variant="outline" onClick={stopListening} className="rounded-full px-8 border-slate-300">Cancel</Button>
                                <Button onClick={() => handleSendMessage()} className="rounded-full px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 dark:shadow-none">Send Voice</Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CardContent className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 flex flex-col justify-between">
                    {messages.length === 0 ? (
                        <div className="my-auto flex flex-col items-center justify-center text-center py-6">
                            {/* Blue circular pill icon wrapper matching requested UI */}
                            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-900/60 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                                <Pill className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                            </div>

                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-2">How can I assist you today?</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-base font-medium mb-10 max-w-lg">
                                Get instant clinical advice, check medicine stocks, or understand side effects.
                            </p>

                            {/* 4 Quick Action Cards in 2x2 Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                                {quickActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSendMessage(action.prompt)}
                                        className={`p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 ${action.borderColor} bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all text-left shadow-sm hover:shadow-md flex items-start gap-4 group cursor-pointer`}
                                    >
                                        <div className={`p-3 rounded-2xl ${action.iconBg} flex-shrink-0 transition-transform group-hover:scale-105`}>
                                            {action.icon}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                {action.title}
                                            </h4>
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                                                {action.subtitle}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {messages.map((m) => (
                                <motion.div
                                    key={m.id}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className={`flex gap-4 ${m.isUser ? 'justify-end' : 'justify-start'}`}
                                >
                                    {!m.isUser && (
                                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-md shadow-indigo-200 dark:shadow-none">
                                            <Bot className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-6 py-4 shadow-sm relative ${m.isUser
                                            ? 'bg-indigo-600 text-white rounded-br-none'
                                            : 'bg-slate-100/90 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 text-slate-900 dark:text-slate-100 rounded-bl-none'
                                            }`}
                                    >
                                        <div className={`prose prose-sm max-w-none ${m.isUser ? 'prose-invert text-white' : 'dark:prose-invert'}`}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.text}</ReactMarkdown>
                                        </div>
                                        <span className={`text-[10px] font-medium mt-2 block ${m.isUser ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {m.timestamp}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                            {isLoading && (
                                <div className="flex items-center gap-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium ml-12">
                                    <Bot className="w-5 h-5 animate-spin" /> Consulting Expert Pharmacist...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {/* Bottom Floating Input Bar matching UI screenshot */}
                    <div className="mt-6 pt-4">
                        <div className="bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-full p-2 pl-3 flex items-center gap-3 shadow-inner">
                            <button
                                onClick={isListening ? stopListening : startListening}
                                type="button"
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 shadow-sm'
                                    }`}
                                title="Voice input"
                            >
                                {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                            </button>

                            <input
                                type="text"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Message Expert Pharmacy Agent..."
                                className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-base font-normal px-2"
                            />

                            <button
                                onClick={() => handleSendMessage()}
                                disabled={!inputValue.trim() && !isLoading}
                                type="button"
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${inputValue.trim()
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-300 dark:shadow-none hover:bg-indigo-700 cursor-pointer'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                    }`}
                                title="Send message"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-center text-xs font-medium text-slate-400 dark:text-slate-500 mt-3">
                            AI can make mistakes. Consider verifying important clinical information.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
