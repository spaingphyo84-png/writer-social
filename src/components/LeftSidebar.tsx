import { Bookmark, BookOpen, Feather, Home, Layers3, PenLine, UserCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import type { FeedView, TranslationKey } from '../i18n'
import type { Trend } from '../types'
import { Avatar } from './Common'

interface LeftSidebarProps {
  filter: FeedView
  onFilterChange: (filter: FeedView) => void
  onWrite: () => void
  trends: Trend[]
}

const items: { key: FeedView; label: TranslationKey; icon: LucideIcon; accent: string; private?: boolean }[] = [
  { key: 'all', label: 'nav.home', icon: Home, accent: 'text-terracotta-500' },
  { key: 'poem', label: 'nav.poems', icon: Feather, accent: 'text-rose-500' },
  { key: 'story', label: 'nav.stories', icon: BookOpen, accent: 'text-emerald-600' },
  { key: 'general', label: 'nav.general', icon: Layers3, accent: 'text-sky-600' },
  { key: 'following', label: 'nav.following', icon: UserCheck, accent: 'text-violet-600', private: true },
  { key: 'saved', label: 'nav.saved', icon: Bookmark, accent: 'text-amber-600', private: true },
]

export default function LeftSidebar({ filter, onFilterChange, onWrite, trends }: LeftSidebarProps) {
  const { t } = useLocale()
  const { user, openProfile } = useAuth()
  const countFor = (category: string) => trends.find((trend) => trend.category === category)?.count ?? 0

  return (
    <aside className="hidden w-[236px] shrink-0 md:block">
      <div className="sticky top-[84px] space-y-4">
        <nav className="card p-2.5">
          <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-700/45 dark:text-parchment-200/40">
            {t('nav.categories')}
          </p>
          {items.filter((item) => !item.private || user).map(({ key, label, icon: Icon, accent }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange(key)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${active
                  ? 'bg-terracotta-500/10 text-terracotta-600 dark:bg-gold-500/10 dark:text-gold-400'
                  : 'text-ink-700 hover:bg-parchment-100 dark:text-parchment-200 dark:hover:bg-ink-800'}`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? 'text-terracotta-500 dark:text-gold-400' : accent}`} />
                <span className="flex-1">{t(label)}</span>
                {['poem', 'story', 'general'].includes(key) && <span className="text-[11px] font-semibold opacity-50">{countFor(key)}</span>}
              </button>
            )
          })}
          {user && (
            <button
              type="button"
              onClick={openProfile}
              className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-parchment-200 px-3 py-3 text-left text-sm font-medium text-ink-700 transition hover:bg-parchment-100 dark:border-ink-800 dark:text-parchment-200 dark:hover:bg-ink-800"
            >
              <Avatar name={user.authorName} url={user.avatarUrl} size="sm" />
              <span className="truncate">{t('nav.profile')}</span>
            </button>
          )}
        </nav>

        <div className="card overflow-hidden p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gold-400/15 text-gold-500">
            <PenLine className="h-[18px] w-[18px]" />
          </div>
          <p className="font-serif text-sm font-semibold leading-snug text-ink-900 dark:text-parchment-100">{t('side.quickWrite')}</p>
          <button type="button" onClick={onWrite} className="btn-secondary mt-4 w-full !py-2 text-xs">
            {t('side.quickWriteButton')}
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 text-[11px] text-ink-700/45 dark:text-parchment-200/35">
          <Users className="h-3.5 w-3.5" /> {t('side.footer')}
        </div>
      </div>
    </aside>
  )
}
