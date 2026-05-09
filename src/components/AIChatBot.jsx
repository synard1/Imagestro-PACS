
import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { aiService } from '../services/aiService'
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import {
    Search, History, X, Send, RefreshCw, MessageSquare, Calendar, ChevronLeft,
    Maximize2, Minimize2, Copy, Check, AlertTriangle
} from 'lucide-react'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { getConfigSync } from '../services/config'

// Contextual Chips Configuration
const CONTEXTUAL_CHIPS = {
    '/dashboard': ["Study Hari Ini", "Cek Order URGENT", "Order Pending"],
    '/worklist': ["Filter: CT Scan", "Cari Pasien", "Order Belum Terjadwal", "Refresh Data"],
    '/studies': ["Filter: Hari Ini", "Cari Study ID", "Upload DICOM", "Export List"],
    '/orders': ["Buat Order Baru", "Cek Jadwal Besok", "Statistik Order"],
    '/patients': ["Daftar Pasien Baru", "Cari MRN", "Gabungkan Pasien"],
    '/doctors': ["Tambah Dokter", "Lihat Performa", "Jadwal Praktek"],
    '/settings': ["Backup Data", "Pengaturan User", "Sistem Log"]
}

const DEFAULT_CHIPS = ["Pasien Hari Ini", "Statistik Modality", "Order URGENT"]

export default function AIChatBot() {
    const config = getConfigSync()
    const registry = loadRegistry()
    const navigate = useNavigate()
    const location = useLocation()

    // Safety check: must be enabled in BOTH legacy config and central registry
    if (config.aiChat?.enabled !== true || registry.ai?.enabled !== true) {
        return null;
    }

    const [isOpen, setIsOpen] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false) // Maximize state

    // Sessions: { '2023-10-27': [msg1, msg2], ... }
    const [sessions, setSessions] = useState({})
    const [viewingDate, setViewingDate] = useState(new Date().toISOString().split('T')[0])
    const [showHistory, setShowHistory] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [streamingStatus, setStreamingStatus] = useState('') // New state
    const [suggestions, setSuggestions] = useState([])
    const [copiedIndex, setCopiedIndex] = useState(null) // For copy feedback
    const messagesEndRef = useRef(null)

    // Streaming Smoother Refs
    const streamBufferRef = useRef('')
    const streamIntervalRef = useRef(null)
    const isStreamDoneRef = useRef(false)
    const finalDataRef = useRef(null)

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (streamIntervalRef.current) clearInterval(streamIntervalRef.current)
        }
    }, [])

    const todayDate = new Date().toISOString().split('T')[0]
    const isToday = viewingDate === todayDate
    const currentMessages = sessions[viewingDate] || []

    // Filter messages for search
    const displayedMessages = searchQuery.trim()
        ? currentMessages.filter(m =>
            JSON.stringify(m).toLowerCase().includes(searchQuery.toLowerCase())
        )
        : currentMessages

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Determine current path for context
    const currentPath = location.pathname

    // Load history/init and update suggestions on navigation
    useEffect(() => {
        const loadSessions = async () => {
            // 1. Load History Logic
            let loadedSessions = {}
            const storedSessions = localStorage.getItem('ai_chat_sessions')

            if (storedSessions) {
                try {
                    loadedSessions = JSON.parse(storedSessions)
                    // Cleanup malformed messages from previous bugs
                    Object.keys(loadedSessions).forEach(key => {
                        if (Array.isArray(loadedSessions[key])) {
                            loadedSessions[key] = loadedSessions[key].filter(msg =>
                                msg.text &&
                                !msg.text.startsWith('undefinedundefined') &&
                                msg.text !== 'undefined'
                            )
                        }
                    })
                } catch (e) { console.error(e) }
            } else {
                // Migrate legacy history
                const legacy = localStorage.getItem('ai_chat_history')
                if (legacy) {
                    try {
                        loadedSessions = { [todayDate]: JSON.parse(legacy) }
                        localStorage.removeItem('ai_chat_history')
                    } catch (e) { }
                }
            }

            // Ensure today exists
            if (!loadedSessions[todayDate]) {
                loadedSessions[todayDate] = []
            }

            setSessions(loadedSessions)

            // 2. Set Contextual Suggestions immediately (Frontend Logic)
            const matchedChipsPath = Object.keys(CONTEXTUAL_CHIPS).find(path => currentPath.startsWith(path))
            const initialChips = matchedChipsPath ? CONTEXTUAL_CHIPS[matchedChipsPath] : (CONTEXTUAL_CHIPS['/dashboard'] || DEFAULT_CHIPS)
            setSuggestions(initialChips)

            // 3. Fetch Backend Init (Silent update for smarter chips if available)
            // Pass context to backend logic
            aiService.initialize({ page: currentPath }).then(d => {
                if (d.suggestions && d.suggestions.length > 0) {
                    setSuggestions(d.suggestions)
                }
            }).catch(() => {
                // Keep frontend chips on error
            })

            // If today is empty, ensure welcome message
            if (loadedSessions[todayDate].length === 0) {
                await loadFreshInit(loadedSessions)
            }
        }
        loadSessions()
    }, [currentPath]) // Re-run when path changes to update chips!

    const loadFreshInit = async (currentSessions = {}) => {
        setLoading(true)
        try {
            const data = await aiService.initialize({ page: currentPath })
            // Default welcome message if none provided
            const welcomeMsg = { type: 'bot', text: data.welcome_message || 'Halo! Saya asisten AI PACS Anda.', timestamp: new Date().toISOString() }

            // Only add welcome message if session is actually empty
            setSessions(prev => {
                const checkedSessions = prev[todayDate] ? prev : currentSessions
                if (checkedSessions[todayDate]?.length > 0) return prev; // Don't duplicate

                return {
                    ...checkedSessions,
                    [todayDate]: [welcomeMsg]
                }
            })

            if (data.suggestions) setSuggestions(data.suggestions)
        } catch (e) {
            setSessions(prev => {
                if (prev[todayDate]?.length > 0) return prev;
                return {
                    ...prev,
                    [todayDate]: [{ type: 'bot', text: 'Halo! Saya asisten AI PACS (Offline Mode).', timestamp: new Date().toISOString() }]
                }
            })
        } finally {
            setLoading(false)
        }
    }

    // Save sessions change and Scroll
    useEffect(() => {
        if (Object.keys(sessions).length > 0) {
            try {
                localStorage.setItem('ai_chat_sessions', JSON.stringify(sessions))
            } catch (e) { console.error("Could not save chat sessions", e) }
        }
        if (isToday && !searchQuery) scrollToBottom()
    }, [sessions, viewingDate, searchQuery])

    // Draggable Logic
    // Init position from storage or default
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('ai_chat_position')
        return saved ? JSON.parse(saved) : { bottom: 24, right: 24 }
    })

    // Window size tracking for smart clamping
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight })

    useEffect(() => {
        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const [isDragging, setIsDragging] = useState(false)
    const dragStartRef = useRef(null)

    const handleDragStart = (e) => {
        if (isExpanded) return; // Disable drag when expanded
        // Only start drag on left click or touch
        if (e.type === 'mousedown' && e.button !== 0) return;

        setIsDragging(true)
        const clientX = e.clientX || e.touches?.[0]?.clientX
        const clientY = e.clientY || e.touches?.[0]?.clientY

        dragStartRef.current = {
            x: clientX,
            y: clientY,
            initialRight: position.right,
            initialBottom: position.bottom
        }
    }

    const handleDragMove = (e) => {
        if (!isDragging || !dragStartRef.current) return
        const clientX = e.clientX || e.touches?.[0]?.clientX
        const clientY = e.clientY || e.touches?.[0]?.clientY
        const deltaX = dragStartRef.current.x - clientX
        const deltaY = dragStartRef.current.y - clientY

        let newRight = dragStartRef.current.initialRight + deltaX
        let newBottom = dragStartRef.current.initialBottom + deltaY

        // Boundary Clamping (Pagar Pengaman)
        const MARGIN = 10
        const BUTTON_SIZE = 60 // approx size of button

        // Prevent going off-screen (Right/Left)
        newRight = Math.max(MARGIN, Math.min(newRight, window.innerWidth - BUTTON_SIZE - MARGIN))

        // Prevent going off-screen (Bottom/Top)
        newBottom = Math.max(MARGIN, Math.min(newBottom, window.innerHeight - BUTTON_SIZE - MARGIN))

        setPosition({
            right: newRight,
            bottom: newBottom
        })
    }

    const handleDragEnd = () => {
        setTimeout(() => setIsDragging(false), 100)
        dragStartRef.current = null
        // Persist position
        localStorage.setItem('ai_chat_position', JSON.stringify(position))
    }

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove)
            window.addEventListener('mouseup', handleDragEnd)
            window.addEventListener('touchmove', handleDragMove)
            window.addEventListener('touchend', handleDragEnd)
        }
        return () => {
            window.removeEventListener('mousemove', handleDragMove)
            window.removeEventListener('mouseup', handleDragEnd)
            window.removeEventListener('touchmove', handleDragMove)
            window.removeEventListener('touchend', handleDragEnd)
        }
    }, [isDragging, position])

    // Smart Clamping Logic for Window Opening
    const CHAT_HEIGHT = 600
    const CHAT_WIDTH = 384 // w-96 approx (24rem)
    const MARGIN = 20

    let safeBottom = position.bottom
    let safeRight = position.right

    if (!isExpanded) {
        if (safeBottom + CHAT_HEIGHT + MARGIN > windowSize.height) {
            safeBottom = Math.max(MARGIN, windowSize.height - CHAT_HEIGHT - MARGIN)
        }
        if (safeRight + CHAT_WIDTH + MARGIN > windowSize.width) {
            safeRight = Math.max(MARGIN, windowSize.width - CHAT_WIDTH - MARGIN)
        }
    }

    // Dynamic styles for Expanded vs Normal mode
    const windowStyle = isExpanded
        ? {
            position: 'fixed',
            top: 20,
            left: 20,
            right: 20,
            bottom: 20,
            width: 'auto',
            height: 'auto',
            zIndex: 60
        }
        : {
            position: 'fixed',
            bottom: safeBottom,
            right: safeRight,
            height: `${CHAT_HEIGHT}px`,
            width: '24rem', // w-96 equivalent
            zIndex: 50
        }

    // Copy to clipboard
    const handleCopy = (text, idx) => {
        navigator.clipboard.writeText(text)
        setCopiedIndex(idx)
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    // Reset Chat (New Session with Archiving)
    const handleNewChat = () => {
        setSessions(prev => {
            const current = prev[todayDate] || [];

            // If empty or only has 1 welcome message, just reset/reload (no archive needed)
            if (current.length === 0 || (current.length === 1 && current[0].type === 'bot')) {
                setTimeout(() => loadFreshInit(), 50);
                return { ...prev, [todayDate]: [] };
            }

            // Valid constraints -> Archive it
            const timestamp = new Date().getTime();
            const archiveKey = `${todayDate}_archive_${timestamp}`;
            const newSessions = { ...prev };

            // Move current to archive
            newSessions[archiveKey] = current;

            // Reset today
            newSessions[todayDate] = [];

            return newSessions;
        });

        // Trigger fresh init after state update sequence
        setTimeout(() => {
            loadFreshInit();
        }, 100);

        // Clear input and streaming states
        setInput('');
        setStreamingStatus('');
        setLoading(false);
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }

    const handleSuggestion = (text) => processMessage(text)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!input.trim()) return
        processMessage(input)
    }

    const processMessage = async (text) => {
        if (!isToday) {
            setViewingDate(todayDate)
        }

        const timestamp = new Date().toISOString()
        const userMsg = { type: 'user', text: text, timestamp }

        // 1. Add User Message
        setSessions(prev => ({
            ...prev,
            [todayDate]: [...(prev[todayDate] || []), userMsg]
        }))

        setInput('')
        setLoading(true)
        setStreamingStatus('Menginisialisasi...') // Awal

        // Context Awareness
        const context = {
            page: window.location.pathname,
            title: document.title
        }

        // Define Streaming Callbacks
        const callbacks = {
            onStatus: (status) => {
                setStreamingStatus(status)
            },
            onStart: () => {
                setStreamingStatus('Mengetik...')
                // Initialize Smoother
                streamBufferRef.current = ''
                isStreamDoneRef.current = false
                finalDataRef.current = null

                // Add Empty Bot Message
                setSessions(prev => {
                    const current = prev[todayDate] || []
                    return {
                        ...prev,
                        [todayDate]: [...current, { type: 'bot', text: '', timestamp: new Date().toISOString() }]
                    }
                })

                if (streamIntervalRef.current) clearInterval(streamIntervalRef.current)

                // Start Typing Loop
                streamIntervalRef.current = setInterval(() => {
                    const pending = streamBufferRef.current

                    if (pending.length > 0) {
                        // Dynamic typing speed: Faster if buffer is large
                        const chunkSize = pending.length > 50 ? 5 : 2;
                        const chunk = pending.slice(0, chunkSize);
                        streamBufferRef.current = pending.slice(chunkSize);

                        setSessions(prev => {
                            const current = prev[todayDate] || []
                            if (current.length === 0) return prev;
                            const lastIndex = current.length - 1
                            const lastMsg = current[lastIndex]
                            if (lastMsg.type !== 'bot') return prev;

                            const updatedMsg = { ...lastMsg, text: (lastMsg.text || '') + chunk }
                            const updatedList = [...current]
                            updatedList[lastIndex] = updatedMsg
                            return { ...prev, [todayDate]: updatedList }
                        })
                    } else if (isStreamDoneRef.current) {
                        // Stream Finished AND Buffer Empty -> Finalize
                        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current)
                        setLoading(false)
                        setStreamingStatus('')

                        const data = finalDataRef.current
                        if (data) {
                            setSessions(prev => {
                                const current = prev[todayDate] || []
                                const lastIndex = current.length - 1
                                const lastMsg = current[lastIndex]
                                if (!lastMsg || lastMsg.type !== 'bot') return prev;

                                const updatedMsg = {
                                    ...lastMsg,
                                    // Fallback: Use content from 'end' event if stream was empty or incomplete
                                    text: data.content || lastMsg.text || '',
                                    chart: data.type === 'chart' ? { ...data, ...data.visual } : undefined,
                                    kpi: data.type === 'kpi' ? { ...data, ...data.visual } : undefined,
                                }
                                const updatedList = [...current]
                                updatedList[lastIndex] = updatedMsg
                                return { ...prev, [todayDate]: updatedList }
                            })

                            if (data.suggestion_chips && Array.isArray(data.suggestion_chips)) {
                                setSuggestions(data.suggestion_chips)
                            } else if (data.visual?.suggestion_chips) {
                                setSuggestions(data.visual.suggestion_chips)
                            }
                        }
                    }
                }, 20) // 20ms update rate (~50fps)
            },
            onChunk: (chunk) => {
                const cleanChunk = (chunk === undefined || chunk === null) ? '' : String(chunk)
                streamBufferRef.current += cleanChunk
            },
            onFinish: (data) => {
                // Signal completion to the loop
                isStreamDoneRef.current = true
                finalDataRef.current = data
            },
            onError: (errMsg) => {
                if (streamIntervalRef.current) clearInterval(streamIntervalRef.current)
                setLoading(false)
                setStreamingStatus('')
                console.error("Stream Error:", errMsg)

                setSessions(prev => {
                    const current = prev[todayDate] || []
                    return {
                        ...prev,
                        [todayDate]: [...current, { type: 'bot', text: `Maaf, terjadi kesalahan: ${errMsg}`, timestamp: new Date().toISOString() }]
                    }
                })
            }
        }

        // Call streaming service
        await aiService.chatStream(text, context, callbacks)
    }

    // Custom Link Renderer for internal navigation
    const MarkdownLink = ({ href, children, ...props }) => {
        const isInternal = href && (href.startsWith('/') || href.startsWith(window.location.origin))
        const handleClick = (e) => {
            if (isInternal) {
                e.preventDefault()
                // Strip origin if present to get path
                const path = href.replace(window.location.origin, '')
                navigate(path)
            }
        }
        return (
            <a
                href={href}
                onClick={handleClick}
                className="underline font-medium hover:text-blue-500 cursor-pointer"
                target={isInternal ? "_self" : "_blank"}
                rel={isInternal ? "" : "noopener noreferrer"}
                {...props}
            >
                {children}
            </a>
        )
    }

    if (!isOpen) {
        return (
            <div
                className="fixed z-50 cursor-move"
                style={{ bottom: position.bottom, right: position.right }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
            >
                <button
                    onClick={() => !isDragging && setIsOpen(true)}
                    className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                    title="AI Assistant (Drag to move)"
                >
                    <MessageSquare size={24} />
                </button>
            </div>
        )
    }

    return (
        <>
            {/* Overlay background when maximized */}
            {isExpanded && <div className="fixed inset-0 bg-black/20 z-50 backdrop-blur-sm" onClick={() => setIsExpanded(false)} />}

            <div
                className={`flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transition-all duration-300 ease-in-out ${!isExpanded ? 'md:w-96' : ''}`}
                style={windowStyle}
            >
                {/* Header */}
                <div
                    className={`bg-blue-600 p-3 text-white flex flex-col gap-2 shadow-sm ${!isExpanded ? 'cursor-move' : ''}`}
                    onMouseDown={!isExpanded ? handleDragStart : undefined}
                    onTouchStart={!isExpanded ? handleDragStart : undefined}
                >
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {showHistory ? (
                                <button onClick={() => setShowHistory(false)} className="hover:bg-white/20 p-1 rounded">
                                    <ChevronLeft size={20} />
                                </button>
                            ) : (
                                <MessageSquare size={20} />
                            )}
                            <span className="font-semibold text-sm">
                                {showHistory ? 'History Chat' : (isToday ? 'AI Assistant' : `History: ${viewingDate}`)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            {!showHistory && (
                                <>
                                    <button
                                        onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }}
                                        className={`p-1.5 rounded transition-colors ${showSearch ? 'bg-white/20' : 'hover:bg-white/20'}`}
                                        title="Search"
                                    >
                                        <Search size={16} />
                                    </button>
                                    <button
                                        onClick={() => setShowHistory(true)}
                                        className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                        title="History"
                                    >
                                        <History size={16} />
                                    </button>
                                    {isToday && (
                                        <button
                                            onClick={handleNewChat}
                                            className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                            title="Reset"
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    )}
                                </>
                            )}
                            {/* Maximize/Minimize Toggle */}
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                                title={isExpanded ? "Restore" : "Maximize"}
                            >
                                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    {showSearch && !showHistory && (
                        <div className="relative">
                            <input
                                type="text"
                                autoFocus
                                placeholder="Cari dalam pesan..."
                                className="w-full pl-8 pr-2 py-1.5 text-xs text-slate-800 rounded bg-white/90 focus:bg-white outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {showHistory ? (
                    <div className="flex-1 overflow-y-auto bg-slate-50 p-2">
                        <div className="space-y-2">
                            {Object.keys(sessions).sort().reverse().map(date => (
                                <button
                                    key={date}
                                    onClick={() => { setViewingDate(date); setShowHistory(false); }}
                                    className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${date === todayDate
                                        ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${date === todayDate ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm text-slate-800">
                                                {date === todayDate ? 'Hari Ini' : date}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {sessions[date]?.length || 0} pesan
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronLeft size={16} className="rotate-180 text-slate-400" />
                                </button>
                            ))}
                            {Object.keys(sessions).length === 0 && (
                                <div className="text-center text-slate-400 text-sm py-8">Belum ada riwayat chat.</div>
                            )}
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-tight">
                                <p className="font-semibold mb-1 flex items-center gap-1">
                                    <AlertTriangle size={12} />
                                    Penyimpanan Lokal
                                </p>
                                Riwayat chat ini disimpan di cache browser Anda, bukan di server. Jika Anda membersihkan cache browser, seluruh riwayat chat akan hilang.
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                        {displayedMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg p-3 group relative ${msg.type === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none shadow-md'
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                                    }`}>

                                    {/* Copy Button (on hover) */}
                                    {msg.type === 'bot' && msg.text && (
                                        <button
                                            onClick={() => handleCopy(msg.text, idx)}
                                            className="absolute top-2 right-2 p-1 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Copy text"
                                        >
                                            {copiedIndex === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                        </button>
                                    )}

                                    {/* Text Content */}
                                    {msg.text && (
                                        <div className={`text-sm prose prose-sm max-w-none ${msg.type === 'user' ? 'prose-invert text-white' : 'text-slate-800'}`}>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    a: MarkdownLink,
                                                    p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                                    li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                                                    table: ({ node, ...props }) => <div className="overflow-x-auto my-2"><table className="min-w-full divide-y divide-slate-200 text-xs" {...props} /></div>,
                                                    thead: ({ node, ...props }) => <thead className="bg-slate-50" {...props} />,
                                                    th: ({ node, ...props }) => <th className="px-2 py-1 text-left font-medium text-slate-500 uppercase tracking-wider border-b" {...props} />,
                                                    td: ({ node, ...props }) => <td className="px-2 py-1 whitespace-nowrap border-b text-slate-700" {...props} />,
                                                }}
                                            >
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* Timestamp */}
                                    {msg.timestamp && (
                                        <div className={`text-[10px] mt-1 text-right ${msg.type === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    )}

                                    {/* KPI Display */}
                                    {msg.kpi && (
                                        <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-100">
                                            <div className="text-xs text-slate-500 uppercase font-semibold">{msg.kpi.content}</div>
                                            <div className="text-2xl font-bold text-blue-700 mt-1">{msg.kpi.value}</div>
                                            {msg.kpi.trend && (
                                                <div className="text-xs text-green-600 font-medium mt-1">
                                                    {msg.kpi.trend} vs last month
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {msg.chart && (
                                        <div className={`mt-3 bg-slate-50 rounded border border-slate-100 p-2 ${isExpanded ? 'h-96' : 'h-40'}`}>
                                            <div className="text-xs font-semibold text-center mb-2 text-slate-600">{msg.chart.title}</div>
                                            <div className="w-full h-full min-w-[220px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    {renderChart(msg.chart)}
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 rounded-lg p-3 rounded-bl-none shadow-sm flex items-center gap-3">
                                    <div className="flex gap-1">
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                                    </div>
                                    {streamingStatus && (
                                        <span className="text-xs text-slate-500 animate-pulse font-medium">{streamingStatus}</span>
                                    )}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Footer Input */}
                {!showHistory && (
                    <div className="bg-white border-t border-slate-200">
                        {/* Suggestions */}
                        {!loading && isToday && suggestions.length > 0 && !searchQuery && (
                            <div className="px-3 pt-3 pb-1 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSuggestion(s)}
                                        className="flex-shrink-0 px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 text-xs rounded-full border border-slate-200 transition-colors whitespace-nowrap"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* Input Area */}
                        {isToday ? (
                            <form onSubmit={handleSubmit} className="p-3">
                                <div className="flex gap-2 relative">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Ketik pertanyaan..."
                                        className="flex-1 input text-sm px-4 py-2 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                        disabled={!!searchQuery}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || loading || !!searchQuery}
                                        className="px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center font-medium"
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                                <div className="text-center text-[10px] text-slate-400 mt-2">
                                    AI dapat membuat kesalahan. Mohon verifikasi informasi penting.
                                </div>
                            </form>
                        ) : (
                            <div className="p-4 text-center bg-slate-50 border-t">
                                <button
                                    onClick={() => setViewingDate(todayDate)}
                                    className="text-sm font-medium text-blue-600 hover:underline"
                                >
                                    Kembali ke Chat Hari Ini
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}

function renderChart(config) {
    if (config.chart_type === 'bar') {
        return (
            <BarChart data={config.data.labels.map((l, i) => ({ name: l, value: config.data.datasets[0].data[i] }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
        )
    }
    if (config.chart_type === 'pie') {
        return (
            <PieChart>
                <Pie
                    data={config.data.labels.map((l, i) => ({ name: l, value: config.data.datasets[0].data[i] }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                >
                    {config.data.labels.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip />
            </PieChart>
        )
    }
    return null
}
