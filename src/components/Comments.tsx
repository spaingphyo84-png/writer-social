import { useEffect, useState } from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { Comment } from '../types'
import { timeAgo } from '../utils'
import { Avatar, PenBadge } from './Common'

interface CommentsProps {
  postId: number
  open: boolean
  count: number
  onCountChange: (count: number) => void
}

export default function Comments({ postId, open, count, onCountChange }: CommentsProps) {
  const { t } = useLocale()
  const { user, openAuth } = useAuth()
  const { toast } = useToast()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || comments.length) return
    let active = true
    setLoading(true)
    api.comments(postId)
      .then((result) => { if (active) setComments(result.comments) })
      .catch(() => { if (active) toast(t('common.error'), 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, postId, comments.length, t, toast])

  async function send() {
    if (!user) {
      toast(t('post.loginToComment'), 'info')
      openAuth('login')
      return
    }
    if (!text.trim()) return toast(t('post.commentRequired'), 'error')
    setSending(true)
    try {
      const result = await api.addComment(postId, text.trim())
      setComments((current) => [...current, result.comment])
      setText('')
      onCountChange(count + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSending(false)
    }
  }

  async function remove(commentId: number) {
    try {
      await api.deleteComment(postId, commentId)
      const remaining = comments.filter((comment) => comment.id !== commentId)
      setComments(remaining)
      onCountChange(remaining.length)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  if (!open) return null

  return (
    <div className="border-t border-parchment-200 px-4 py-4 dark:border-ink-800 sm:px-5">
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-terracotta-500" /></div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-center text-xs text-ink-700/50 dark:text-parchment-200/45">{t('post.noComments')}</p>
      ) : (
        <div className="mb-4 space-y-3.5">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5">
              <Avatar name={comment.author.authorName} url={comment.author.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-parchment-100 px-3 py-2.5 dark:bg-ink-800/70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-ink-900 dark:text-parchment-50">{comment.author.authorName}</span>
                  <PenBadge name={comment.author.penName} />
                  <span className="text-[10px] text-ink-700/45 dark:text-parchment-200/40">{timeAgo(comment.createdAt, t)}</span>
                  {user?.id === comment.author.id && (
                    <button type="button" onClick={() => remove(comment.id)} title={t('post.delete')} className="ml-auto text-ink-700/40 transition hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-800 dark:text-parchment-100">{comment.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Avatar name={user?.authorName ?? t('post.unknownWriter')} url={user?.avatarUrl} size="sm" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void send() }}
          placeholder={t('post.commentPlaceholder')}
          className="input !py-2 text-xs"
        />
        <button type="button" onClick={send} disabled={sending} className="btn-primary !h-9 !w-9 !px-0" title={t('post.sendComment')}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
