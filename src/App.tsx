import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Feather, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { api } from './api'
import AuthModal from './components/AuthModal'
import Composer from './components/Composer'
import EditProfileModal from './components/EditProfileModal'
import { PenBadge, Spinner } from './components/Common'
import Header from './components/Header'
import LeftSidebar from './components/LeftSidebar'
import PostCard from './components/PostCard'
import RightSidebar from './components/RightSidebar'
import { useAuth } from './context/AuthContext'
import { useLocale } from './context/SettingsContext'
import { useToast } from './context/ToastContext'
import type { FeedFilter } from './i18n'
import type { Post, Trend, Writer } from './types'

const feedTitles = {
  all: 'feed.homeTitle',
  poem: 'feed.poemsTitle',
  story: 'feed.storiesTitle',
  general: 'feed.generalTitle',
} as const

const feedSubtitles = {
  all: 'feed.homeSubtitle',
  poem: 'feed.poemsSubtitle',
  story: 'feed.storiesSubtitle',
  general: 'feed.generalSubtitle',
} as const

const mobileCategories: FeedFilter[] = ['all', 'poem', 'story', 'general']

export default function App() {
  const { t } = useLocale()
  const { toast } = useToast()
  const { user } = useAuth()
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [authorFilter, setAuthorFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [writers, setWriters] = useState<Writer[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [feedVersion, setFeedVersion] = useState(0)
  const [cleaningSpam, setCleaningSpam] = useState(false)
  const [focusSignal, setFocusSignal] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.featuredWriters().then((result) => setWriters(result.writers)).catch(() => undefined)
    api.trending().then((result) => setTrends(result.trending)).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    api.posts({ category: filter, authorId: authorFilter ?? undefined, limit: 100 })
      .then((result) => { if (active) setPosts(result.posts) })
      .catch(() => { if (active) toast(t('common.error'), 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, authorFilter, feedVersion, t, toast])

  const visiblePosts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return posts
    return posts.filter((post) =>
      [post.title, post.body, post.author.authorName, post.author.penName]
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [posts, search])

  useEffect(() => {
    if (loading || visiblePosts.length === 0) return
    const target = new URLSearchParams(window.location.search).get('post')
    if (!target) return
    const timer = window.setTimeout(() => {
      document.getElementById(`post-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [loading, visiblePosts.length])

  function selectFilter(next: FeedFilter) {
    setFilter(next)
    setAuthorFilter(null)
  }

  function selectWriter(id: number | null) {
    setAuthorFilter(id)
    setFilter('all')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCreated(post: Post) {
    setFilter('all')
    setAuthorFilter(null)
    setPosts((current) => [post, ...current])
  }

  function handleUpdated(post: Post) {
    setPosts((current) => current.map((item) => (item.id === post.id ? post : item)))
    if (filter !== 'all' && post.category !== filter) setFilter('all')
    api.trending().then((result) => setTrends(result.trending)).catch(() => undefined)
  }

  async function cleanSpam() {
    setCleaningSpam(true)
    try {
      const result = await api.cleanSpam()
      toast(t('admin.spamCleaned', { posts: result.deletedPosts, users: result.deletedUsers }))
      setFeedVersion((value) => value + 1)
      api.featuredWriters().then((data) => setWriters(data.writers)).catch(() => undefined)
      api.trending().then((data) => setTrends(data.trending)).catch(() => undefined)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setCleaningSpam(false)
    }
  }

  const selectedWriter = writers.find((writer) => writer.id === authorFilter)

  return (
    <div className="min-h-screen">
      <Header search={search} onSearchChange={setSearch} onWrite={() => setFocusSignal((value) => value + 1)} />

      <main className="mx-auto flex max-w-[1440px] gap-5 px-3 py-5 sm:px-5">
        <LeftSidebar filter={filter} onFilterChange={selectFilter} onWrite={() => setFocusSignal((value) => value + 1)} trends={trends} />

        <div className="mx-auto w-full min-w-0 max-w-[680px] space-y-4">
          <div className="card p-3 md:hidden">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-700/40 dark:text-parchment-200/35" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('header.search')} className="input !rounded-full !py-2 pl-9 text-xs" />
            </label>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 slim-scroll">
              {mobileCategories.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectFilter(key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === key && !authorFilter
                      ? 'bg-terracotta-500 text-white'
                      : 'bg-parchment-100 text-ink-700 dark:bg-ink-800 dark:text-parchment-200'
                  }`}
                >
                  {t(`category.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-xl font-bold text-ink-900 dark:text-parchment-50 sm:text-2xl">
                  {authorFilter ? t('feed.profileTitle') : t(feedTitles[filter])}
                </h1>
                {authorFilter && selectedWriter && (
                  <button type="button" onClick={() => selectWriter(null)} className="icon-btn !h-7 !w-7" title={t('common.close')}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {authorFilter && selectedWriter ? (
                <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-700/55 dark:text-parchment-200/50">
                  <PenBadge name={selectedWriter.penName} />
                  <span>· {t('feed.profileSubtitle')}</span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-ink-700/55 dark:text-parchment-200/45">{t(feedSubtitles[filter])}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {user?.isAdmin && (
                <button type="button" onClick={() => void cleanSpam()} disabled={cleaningSpam} className="btn-secondary !py-2 text-[11px] !text-red-600 dark:!text-red-400">
                  <ShieldAlert className="h-3.5 w-3.5" /> {t('admin.cleanSpam')}
                </button>
              )}
              <span className="hidden items-center gap-1 text-[11px] font-semibold text-ink-700/45 dark:text-parchment-200/40 sm:flex">
                <SlidersHorizontal className="h-3.5 w-3.5" /> {t('feed.newest')}
              </span>
            </div>
          </div>

          <Composer onCreated={handleCreated} focusSignal={focusSignal} focusRef={composerRef} />

          {loading ? (
            <div className="card"><Spinner label={t('feed.loading')} /></div>
          ) : visiblePosts.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-14 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-parchment-200 text-terracotta-500 dark:bg-ink-800 dark:text-gold-400">
                <Feather className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-lg font-bold text-ink-900 dark:text-parchment-50">
                {search.trim() ? t('common.searchEmpty') : t('feed.emptyTitle')}
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-700/55 dark:text-parchment-200/45">
                {search.trim() ? t('header.search') : t('feed.emptyBody')}
              </p>
              {!user && !search.trim() && (
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn-secondary mt-5 text-xs">
                  {t('nav.join')} <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {visiblePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onDeleted={(id) => setPosts((current) => current.filter((item) => item.id !== id))}
                  onUpdated={handleUpdated}
                  onRepost={(repost) => setPosts((current) => [repost, ...current])}
                />
              ))}
            </div>
          )}
        </div>

        <RightSidebar writers={writers} trends={trends} onSelectWriter={selectWriter} onSelectCategory={selectFilter} />
      </main>

      <AuthModal />
      <EditProfileModal />
    </div>
  )
}
