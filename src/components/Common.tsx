import { useEffect, type ReactNode } from 'react'
import { BookOpen, Feather, Layers3, Loader2, Sparkles, X } from 'lucide-react'
import { resolveAppUrl } from '../config'
import { useLocale } from '../context/SettingsContext'
import type { Category } from '../i18n'
import { initials } from '../utils'

const avatarSizes = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
}

const gradients = [
  'from-terracotta-400 to-gold-500',
  'from-amber-400 to-terracotta-500',
  'from-emerald-500 to-teal-600',
  'from-indigo-500 to-violet-600',
  'from-rose-400 to-terracotta-500',
]

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: keyof typeof avatarSizes }) {
  if (url) {
    return <img src={resolveAppUrl(url)} alt={name} className={`${avatarSizes[size]} shrink-0 rounded-full object-cover ring-2 ring-parchment-200 dark:ring-ink-700`} />
  }
  const color = gradients[(Array.from(name)[0]?.codePointAt(0) ?? 0) % gradients.length]
  return (
    <div className={`${avatarSizes[size]} ${color} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ring-2 ring-parchment-200 dark:ring-ink-700`}>
      {initials(name)}
    </div>
  )
}

export function PenBadge({ name }: { name: string }) {
  return (
    <span className="pen-badge max-w-[130px] truncate" title={name}>
      <Sparkles className="h-3 w-3 shrink-0" />
      {name}
    </span>
  )
}

export function CategoryTag({ category }: { category: Category }) {
  const { t } = useLocale()
  const Icon = category === 'poem' ? Feather : category === 'story' ? BookOpen : Layers3
  return (
    <span className="tag">
      <Icon className="h-3 w-3" />
      {t(`category.${category}`)}
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-700/60 dark:text-parchment-200/50">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

export function ModalShell({ open, onClose, title, subtitle, children }: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { t } = useLocale()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card my-auto w-full max-w-md animate-fade-up p-6 sm:p-7"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-ink-900 dark:text-parchment-100">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-ink-700/60 dark:text-parchment-200/55">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="icon-btn -mr-1 -mt-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
