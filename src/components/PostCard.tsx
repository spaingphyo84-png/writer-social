import { useEffect, useState } from 'react'
import { Copy, Link2, MessageCircle, MoreHorizontal, Repeat2, Share2, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { ReactionType } from '../i18n'
import type { Post } from '../types'
import { timeAgo } from '../utils'
import { Avatar, CategoryTag, PenBadge } from './Common'
import Comments from './Comments'

const reactions: { key: ReactionType; emoji: string; label: 'reaction.love' | 'reaction.haha' | 'reaction.sad'; active: string }[] = [
  { key: 'love', emoji: '❤️', label: 'reaction.love', active: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/30' },
  { key: 'haha', emoji: '😂', label: 'reaction.haha', active: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30' },
  { key: 'sad', emoji: '😢', label: 'reaction.sad', active: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/30' },
]

interface PostCardProps {
  post: Post
  onDeleted: (id: number) => void
  onRepost: (post: Post) => void
}

export default function PostCard({ post, onDeleted, onRepost }: PostCardProps) {
  const { t } = useLocale()
  const { user, openAuth } = useAuth()
  const { toast } = useToast()
  const [counts, setCounts] = useState(post.counts)
  const [viewerReaction, setViewerReaction] = useState<ReactionType | null>(post.viewerReaction)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.counts.comments)
  const [expanded, setExpanded] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => setCounts(post.counts), [post.counts])
  useEffect(() => setViewerReaction(post.viewerReaction), [post.viewerReaction])
  useEffect(() => setCommentCount(post.counts.comments), [post.counts.comments])

  const isOwner = user?.id === post.author.id
  const isLong = post.body.length > 650

  async function react(type: ReactionType) {
    if (!user) {
      toast(t('post.loginToReact'), 'info')
      openAuth('login')
      return
    }
    try {
      const result = await api.react(post.id, type)
      setCounts(result.counts)
      setViewerReaction(result.counts.viewerReaction ?? null)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  async function copyLink() {
    setShareOpen(false)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`)
      toast(t('post.linkCopied'))
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  async function repost() {
    setShareOpen(false)
    if (!user) {
      toast(t('post.loginToShare'), 'info')
      openAuth('login')
      return
    }
    try {
      const result = await api.share(post.id, 'repost')
      if (result.repost) onRepost(result.repost)
      setCounts((current) => ({ ...current, shares: result.shareCount }))
      toast(t('post.reposted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  async function remove() {
    setMoreOpen(false)
    if (!window.confirm(t('post.deleteConfirm'))) return
    try {
      await api.deletePost(post.id)
      onDeleted(post.id)
      toast(t('post.deleted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  return (
    <article id={`post-${post.id}`} className="card overflow-hidden transition-shadow hover:shadow-lg dark:hover:shadow-card-dark">
      {post.repost && (
        <div className="flex items-center gap-1.5 border-b border-parchment-200 bg-parchment-50 px-4 py-2 text-[11px] font-medium text-ink-700/60 dark:border-ink-800 dark:bg-ink-800/40 dark:text-parchment-200/55 sm:px-5">
          <Repeat2 className="h-3.5 w-3.5" /> {t('post.repostedBy')} <PenBadge name={post.repost.penName} />
        </div>
      )}

      <div className="px-4 pt-4 sm:px-5">
        <div className="flex items-start gap-3">
          <Avatar name={post.author.authorName} url={post.author.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-ink-900 dark:text-parchment-50">{post.author.authorName}</span>
              <PenBadge name={post.author.penName} />
            </div>
            <p className="mt-0.5 text-[11px] text-ink-700/50 dark:text-parchment-200/45">
              {timeAgo(post.createdAt, t)} · <span className="capitalize">{t(`category.${post.category}`)}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <CategoryTag category={post.category} />
            <div className="relative">
              <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label={t('post.more')} className="icon-btn !h-8 !w-8">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                  {isOwner && (
                    <div className="card absolute right-0 z-20 mt-1 w-44 animate-fade-up p-1.5">
                      <button type="button" onClick={remove} className="btn-ghost w-full !justify-start !py-2 text-xs text-red-600 dark:text-red-400">
                        <Trash2 className="h-4 w-4" /> {t('post.delete')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <h3 className="mt-4 font-serif text-lg font-bold leading-snug text-ink-900 dark:text-parchment-50 sm:text-xl">{post.title}</h3>
        <div className="relative mt-2">
          <p className={`whitespace-pre-wrap break-words text-[14px] leading-[1.85] text-ink-800 dark:text-parchment-100/90 ${!expanded && isLong ? 'max-h-[19rem] overflow-hidden' : ''}`}>
            {post.body}
          </p>
          {!expanded && isLong && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white dark:from-ink-900" />}
        </div>
        {isLong && (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-xs font-semibold text-terracotta-600 hover:underline dark:text-gold-400">
            {expanded ? t('post.showLess') : t('post.readMore')}
          </button>
        )}

        {post.imageUrl && (
          <div className="mt-4 overflow-hidden rounded-xl border border-parchment-200 dark:border-ink-800">
            <img src={post.imageUrl} alt={t('post.imageAlt')} className="max-h-[420px] w-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-parchment-200 py-3 text-[11px] text-ink-700/55 dark:border-ink-800 dark:text-parchment-200/50">
          <span>❤️ {counts.love}</span>
          <span>😂 {counts.haha}</span>
          <span>😢 {counts.sad}</span>
          <span className="ml-auto">{commentCount} {t('post.comments').toLowerCase()}</span>
          <span>{counts.shares} {t('post.share').toLowerCase()}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 border-t border-parchment-200 px-2 py-1.5 dark:border-ink-800 sm:grid-cols-6 sm:px-3">
        {reactions.map(({ key, emoji, label, active }) => (
          <button
            key={key}
            type="button"
            onClick={() => react(key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-xs font-semibold transition ring-1 ring-transparent ${
              viewerReaction === key ? active : 'text-ink-700/70 hover:bg-parchment-100 dark:text-parchment-200/65 dark:hover:bg-ink-800'
            }`}
          >
            <span className="text-base leading-none">{emoji}</span> {t(label)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCommentsOpen((open) => !open)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-xs font-semibold transition hover:bg-parchment-100 dark:hover:bg-ink-800 ${commentsOpen ? 'text-terracotta-600 dark:text-gold-400' : 'text-ink-700/70 dark:text-parchment-200/65'}`}
        >
          <MessageCircle className="h-4 w-4" /> {t('post.comment')}
        </button>
        <div className="relative col-span-2 sm:col-span-1">
          <button
            type="button"
            onClick={() => setShareOpen((open) => !open)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-xs font-semibold text-ink-700/70 transition hover:bg-parchment-100 dark:text-parchment-200/65 dark:hover:bg-ink-800"
          >
            <Share2 className="h-4 w-4" /> {t('post.share')}
          </button>
          {shareOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShareOpen(false)} />
              <div className="card absolute bottom-full right-0 z-20 mb-2 w-52 animate-fade-up p-1.5 shadow-lg">
                <button type="button" onClick={repost} className="btn-ghost w-full !justify-start !py-2 text-xs">
                  <Repeat2 className="h-4 w-4" /> {t('post.repost')}
                </button>
                <button type="button" onClick={copyLink} className="btn-ghost w-full !justify-start !py-2 text-xs">
                  <Copy className="h-4 w-4" /> {t('post.copyLink')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Comments postId={post.id} open={commentsOpen} count={commentCount} onCountChange={setCommentCount} />
      {!commentsOpen && counts.shares > 0 && (
        <div className="flex items-center gap-1.5 border-t border-parchment-200 px-4 py-2 text-[11px] text-ink-700/45 dark:border-ink-800 dark:text-parchment-200/40 sm:px-5">
          <Link2 className="h-3 w-3" /> {counts.shares} {t('post.share').toLowerCase()}
        </div>
      )}
    </article>
  )
}
