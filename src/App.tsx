import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Feather, Search, ShieldAlert, SlidersHorizontal, UserCheck, UserPlus, X } from 'lucide-react'
import { api } from './api'
import AdminFeedbackModal from './components/AdminFeedbackModal'
import AuthModal from './components/AuthModal'
import Composer from './components/Composer'
import EditProfileModal from './components/EditProfileModal'
import FeedbackModal from './components/FeedbackModal'
import Footer from './components/Footer'
import { PenBadge, Spinner } from './components/Common'
import Header from './components/Header'
import LeftSidebar from './components/LeftSidebar'
import PostCard from './components/PostCard'
import RightSidebar from './components/RightSidebar'
import { useAuth } from './context/AuthContext'
import { useLocale } from './context/SettingsContext'
import { useToast } from './context/ToastContext'
import type { FeedView, TranslationKey } from './i18n'
import type { Post, Trend, User, Writer } from './types'

const feedTitles: Record<FeedView, TranslationKey> = {
  all: 'feed.homeTitle',
  poem: 'feed.poemsTitle',
  story: 'feed.storiesTitle',
  general: 'feed.generalTitle',
  following: 'feed.followingTitle',
  saved: 'feed.savedTitle',
}

const feedSubtitles: Record<FeedView, TranslationKey> = {
  all: 'feed.homeSubtitle',
  poem: 'feed.poemsSubtitle',
  story: 'feed.storiesSubtitle',
  general: 'feed.generalSubtitle',
  following: 'feed.followingSubtitle',
  saved: 'feed.savedSubtitle',
}

const mobileViews: { key: FeedView; label: TranslationKey }[] = [
  { key: 'all', label: 'category.all' },
  { key: 'poem', label: 'category.poem' },
  { key: 'story', label: 'category.story' },
  { key: 'general', label: 'category.general' },
  { key: 'following', label: 'nav.following' },
  { key: 'saved', label: 'nav.saved' },
]

export default function App() {
  const { t } = useLocale()
  const { toast } = useToast()
  const { user, openAuth } = useAuth()
  const [filter, setFilter] = useState<FeedView>('all')
  const [authorFilter, setAuthorFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [writers, setWriters] = useState<Writer[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedVersion, setFeedVersion] = useState(0)
  const [cleaningSpam, setCleaningSpam] = useState(false)
  const [togglingLockdown, setTogglingLockdown] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [focusSignal, setFocusSignal] = useState(0)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [adminFeedbackOpen, setAdminFeedbackOpen] = useState(false)
  const [followingBusy, setFollowingBusy] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.featuredWriters().then((result) => setWriters(result.writers)).catch(() => undefined)
    api.trending().then((result) => setTrends(result.trending)).catch(() => undefined)
    api.registrationStatus().then((result) => setRegistrationOpen(result.registrationOpen)).catch(() => undefined)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!user && (filter === 'following' || filter === 'saved')) setFilter('all')
  }, [user, filter])

  useEffect(() => {
    let active = true
    setLoading(true)
    const special = filter === 'following' || filter === 'saved'
    api.posts({
      category: special ? undefined : filter,
      authorId: authorFilter ?? undefined,
      q: debouncedSearch || undefined,
      feed: special ? filter : undefined,
      limit: 100,
    })
      .then((result) => { if (active) setPosts(result.posts) })
      .catch(() => { if (active) toast(t('common.error'), 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, authorFilter, debouncedSearch, feedVersion, t, toast])

  useEffect(() => {
    if (!authorFilter) {
      setProfile(null)
      return
    }
    let active = true
    api.userProfile(authorFilter)
      .then((result) => { if (active) setProfile(result.user) })
      .catch(() => { if (active) setProfile(null) })
    return () => { active = false }
  }, [authorFilter])

  useEffect(() => {
    if (loading || posts.length === 0) return
    const target = new URLSearchParams(window.location.search).get('post')
    if (!target) return
    const timer = window.setTimeout(() => {
      document.getElementById(`post-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [loading, posts.length])

  function selectFilter(next: FeedView) {
    setFilter(next)
    setAuthorFilter(null)
  }

  function selectWriter(id: number | null) {
    setAuthorFilter(id)
    setFilter('all')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggleFollow() {
    if (!user) {
      openAuth('login')
      return
    }
    if (!profile) return
    setFollowingBusy(true)
    try {
      const result = await api.followUser(profile.id)
      setProfile((current) => (current ? { ...current, ...result } : current))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setFollowingBusy(false)
    }
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

  async function toggleLockdown() {
    setTogglingLockdown(true)
    try {
      const result = await api.lockdown(!registrationOpen)
      setRegistrationOpen(result.registrationOpen)
      toast(t(result.registrationOpen ? 'admin.registrationResumed' : 'admin.registrationPaused'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setTogglingLockdown(false)
    }
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
      <Header
        search={search}
        onSearchChange={setSearch}
        onWrite={() => setFocusSignal((value) => value + 1)}
        registrationOpen={registrationOpen}
        onToggleRegistration={user?.isAdmin ? () => void toggleLockdown() : undefined}
        togglingRegistration={togglingLockdown}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenAdminFeedback={() => setAdminFeedbackOpen(true)}
      />

      <main className="mx-auto flex max-w-[1440px] gap-5 px-3 py-5 sm:px-5">
        <LeftSidebar filter={filter} onFilterChange={selectFilter} onWrite={() => setFocusSignal((value) => value + 1)} trends={trends} />

        <div className="mx-auto w-full min-w-0 max-w-[680px] space-y-4">
          <div className="card p-3 md:hidden">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-700/40 dark:text-parchment-200/35" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('header.search')} className="input !rounded-full !py-2 pl-9 text-xs" />
            </label>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 slim-scroll">
              {mobileViews.filter((view) => user || (view.key !== 'following' && view.key !== 'saved')).map(({ key, label }) => (
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
                  {t(label)}
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
              {authorFilter && profile && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-700/55 dark:text-parchment-200/50">
                  <span><strong>{profile.followers ?? 0}</strong> {t('profile.followers')}</span>
                  <span>·</span>
                  <span><strong>{profile.following ?? 0}</strong> {t('profile.following')}</span>
                  {user?.id !== profile.id && (
                    <button
                      type="button"
                      onClick={() => void toggleFollow()}
                      disabled={followingBusy}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                        profile.isFollowing
                          ? 'border-parchment-300 text-ink-700 dark:border-ink-700 dark:text-parchment-200'
                          : 'border-terracotta-500 bg-terracotta-500 text-white'
                      }`}
                    >
                      {profile.isFollowing ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                      {t(profile.isFollowing ? 'profile.unfollow' : 'profile.follow')}
                    </button>
                  )}
                </div>
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
          ) : posts.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-14 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-parchment-200 text-terracotta-500 dark:bg-ink-800 dark:text-gold-400">
                <Feather className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-lg font-bold text-ink-900 dark:text-parchment-50">
                {debouncedSearch ? t('common.searchEmpty') : t('feed.emptyTitle')}
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-700/55 dark:text-parchment-200/45">
                {debouncedSearch ? t('header.search') : t('feed.emptyBody')}
              </p>
              {!user && !debouncedSearch && (
                <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="btn-secondary mt-5 text-xs">
                  {t('nav.join')} <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onDeleted={(id) => setPosts((current) => current.filter((item) => item.id !== id))}
                  onUpdated={handleUpdated}
                  onRepost={(repost) => setPosts((current) => [repost, ...current])}
                  onBookmarkRemoved={(id) => setPosts((current) => current.filter((item) => item.id !== id))}
                />
              ))}
            </div>
          )}
        </div>

        <RightSidebar writers={writers} trends={trends} onSelectWriter={selectWriter} onSelectCategory={selectFilter} />
      </main>

      <Footer onOpenFeedback={() => setFeedbackOpen(true)} />
      <AuthModal registrationOpen={registrationOpen} />
      <EditProfileModal />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {user?.isAdmin && <AdminFeedbackModal open={adminFeedbackOpen} onClose={() => setAdminFeedbackOpen(false)} />}
    </div>
  )
}
