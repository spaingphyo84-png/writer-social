import { ArrowUpRight, BookOpen, Feather, Layers3, Quote, TrendingUp, Users } from 'lucide-react'
import { useLocale } from '../context/SettingsContext'
import type { Category, FeedFilter } from '../i18n'
import type { Trend, Writer } from '../types'
import { Avatar, PenBadge } from './Common'

interface RightSidebarProps {
  writers: Writer[]
  trends: Trend[]
  onSelectWriter: (id: number | null) => void
  onSelectCategory: (filter: FeedFilter) => void
}

const trendIcons: Record<Category, typeof Feather> = {
  poem: Feather,
  story: BookOpen,
  general: Layers3,
}

export default function RightSidebar({ writers, trends, onSelectWriter, onSelectCategory }: RightSidebarProps) {
  const { t } = useLocale()
  const totalWritings = trends.reduce((sum, trend) => sum + trend.count, 0)
  const poemCount = trends.find((trend) => trend.category === 'poem')?.count ?? 0
  const storyCount = trends.find((trend) => trend.category === 'story')?.count ?? 0

  return (
    <aside className="hidden w-[280px] shrink-0 xl:block">
      <div className="sticky top-[84px] max-h-[calc(100vh-100px)] space-y-4 overflow-y-auto pb-4 slim-scroll">
        <section className="card p-5">
          <div className="mb-1 flex items-center gap-2">
            <Users className="h-4 w-4 text-terracotta-500" />
            <h2 className="section-title">{t('side.featured')}</h2>
          </div>
          <p className="mb-4 text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('side.featuredSub')}</p>
          <div className="space-y-3.5">
            {writers.map((writer) => (
              <div key={writer.id} className="flex items-center gap-2.5">
                <Avatar name={writer.authorName} url={writer.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-900 dark:text-parchment-50">{writer.authorName}</p>
                  <PenBadge name={writer.penName} />
                </div>
                <button
                  type="button"
                  onClick={() => onSelectWriter(writer.id)}
                  title={t('side.viewProfile')}
                  className="icon-btn !h-8 !w-8 text-terracotta-500 hover:bg-terracotta-500/10"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gold-500" />
            <h2 className="section-title">{t('side.trending')}</h2>
          </div>
          <p className="mb-4 text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('side.trendingSub')}</p>
          <div className="space-y-1">
            {(trends.length ? trends : ([
              { category: 'poem' as Category, count: 0 },
              { category: 'story' as Category, count: 0 },
              { category: 'general' as Category, count: 0 },
            ])).map((trend) => {
              const Icon = trendIcons[trend.category]
              return (
                <button
                  key={trend.category}
                  type="button"
                  onClick={() => onSelectCategory(trend.category)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-parchment-100 dark:hover:bg-ink-800"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-parchment-200 text-ink-700 dark:bg-ink-800 dark:text-parchment-200">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-xs font-medium text-ink-800 dark:text-parchment-100">{t(`category.${trend.category}`)}</span>
                  <span className="text-[11px] font-semibold text-ink-700/45 dark:text-parchment-200/40">{trend.count}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="bg-gradient-to-br from-terracotta-500 via-terracotta-400 to-gold-500 p-5 text-white">
            <Quote className="mb-2 h-5 w-5 opacity-70" />
            <p className="font-serif text-sm italic leading-relaxed">“{t('side.quote')}”</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide opacity-80">— {t('side.quoteAuthor')}</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-parchment-200 dark:divide-ink-800">
            {[
              { value: writers.length, label: t('side.members') },
              { value: totalWritings, label: t('side.posts') },
              { value: poemCount + storyCount, label: t('side.poemsCount') },
            ].map((stat) => (
              <div key={stat.label} className="px-2 py-3 text-center">
                <p className="font-serif text-base font-bold text-ink-900 dark:text-parchment-50">{stat.value}</p>
                <p className="text-[9px] uppercase tracking-wide text-ink-700/50 dark:text-parchment-200/45">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
