import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { onNotify } from '../services/notifications'

const ToastCtx = createContext({ notify: () => { } })

export function useToast() {
  return useContext(ToastCtx)
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const notify = useCallback((opts) => {
    const id = Math.random().toString(36).slice(2)
    const toast = {
      id,
      type: opts.type || 'info',
      message: typeof opts.message === 'object' ? JSON.stringify(opts.message) : (opts.message || ''),
      detail: typeof opts.detail === 'object' ? JSON.stringify(opts.detail) : (opts.detail || ''),
      ttl: opts.ttl ?? 5000,
      actionLabel: opts.actionLabel,
      onAction: opts.onAction
    }
    setToasts(prev => [...prev, toast])
    if (toast.ttl > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), toast.ttl)
    }
  }, [])

  const success = useCallback((message, detail) => notify({ type: 'success', message, detail }), [notify])
  const error = useCallback((message, detail) => notify({ type: 'error', message, detail }), [notify])
  const warning = useCallback((message, detail) => notify({ type: 'warning', message, detail }), [notify])
  const info = useCallback((message, detail) => notify({ type: 'info', message, detail }), [notify])

  // Subscribe to global notification events
  useEffect(() => {
    const unsubscribe = onNotify(notify)
    return unsubscribe
  }, [notify])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const contextValue = React.useMemo(() => ({ notify, success, error, warning, info }), [notify, success, error, warning, info]);

  return (
    <ToastCtx.Provider value={contextValue}>
      {children}
      <div className="fixed top-4 right-4 space-y-3 z-[100] max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white flex items-start gap-3 animate-slide-in ${bg(t.type)}`}
            role="alert"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{t.message}</div>
              {t.detail && (
                <div className="text-xs mt-1 opacity-90">{t.detail}</div>
              )}
            </div>
            {t.actionLabel && (
              <button
                className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-xs font-medium whitespace-nowrap"
                onClick={() => { try { t.onAction && t.onAction() } catch (e) { }; dismiss(t.id) }}
              >
                {t.actionLabel}
              </button>
            )}
            <button
              className="text-white/70 hover:text-white flex-shrink-0 text-lg leading-none"
              onClick={() => dismiss(t.id)}
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function bg(type) {
  switch (type) {
    case 'success': return 'bg-emerald-600'
    case 'error': return 'bg-red-600'
    case 'warning': return 'bg-amber-600'
    default: return 'bg-slate-800'
  }
}
