import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useLocale } from './SettingsContext'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; kind: ToastKind }

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const { t } = useLocale()

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++
    setItems((current) => [...current, { id, message, kind }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3800)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6">
        {items.map((item) => {
          const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? CircleAlert : Info
          return (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-2xl border border-parchment-300 bg-white/95 px-4 py-3 shadow-card backdrop-blur dark:border-ink-700 dark:bg-ink-800/95 dark:shadow-card-dark"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${item.kind === 'error' ? 'text-red-500' : item.kind === 'info' ? 'text-sky-500' : 'text-emerald-600'}`} />
              <p className="flex-1 text-sm leading-relaxed text-ink-800 dark:text-parchment-100">{item.message}</p>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                className="rounded-md p-0.5 text-ink-700/50 transition hover:bg-parchment-200 hover:text-ink-900 dark:text-parchment-200/50 dark:hover:bg-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
