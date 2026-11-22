import { useEffect, useState } from 'react'
import { Inbox, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { FeedbackEntry } from '../types'
import { timeAgo } from '../utils'
import { Avatar, ModalShell, Spinner } from './Common'

export default function AdminFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale()
  const { toast } = useToast()
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    api.adminFeedback()
      .then((result) => { if (active) setFeedback(result.feedback) })
      .catch((error) => { if (active) toast(error instanceof Error ? error.message : t('common.error'), 'error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, t, toast])

  async function remove(id: number) {
    if (!window.confirm(t('admin.feedbackDelete'))) return
    try {
      await api.deleteFeedback(id)
      setFeedback((current) => current.filter((item) => item.id !== id))
      toast(t('admin.feedbackDeleted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const categoryLabel = (category: FeedbackEntry['category']) =>
    t(category === 'bug' ? 'feedback.bug' : category === 'suggestion' ? 'feedback.suggestion' : 'feedback.other')

  return (
    <ModalShell open={open} onClose={onClose} title={t('admin.feedbackTitle')}>
      {loading ? (
        <Spinner label={t('common.loading')} />
      ) : feedback.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-ink-700/55 dark:text-parchment-200/50">
          <Inbox className="h-8 w-8" />
          <p className="text-sm">{t('admin.feedbackEmpty')}</p>
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 slim-scroll">
          {feedback.map((item) => (
            <article key={item.id} className="rounded-xl border border-parchment-200 p-3 dark:border-ink-800">
              <div className="flex items-start gap-2.5">
                <Avatar name={item.user.authorName} url={item.user.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-900 dark:text-parchment-50">{item.user.penName}</p>
                  <p className="mt-0.5 text-[10px] text-ink-700/50 dark:text-parchment-200/45">
                    {categoryLabel(item.category)} · {timeAgo(item.createdAt, t)}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(item.id)} aria-label={t('admin.feedbackDelete')} className="icon-btn !h-8 !w-8 text-red-600 dark:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-800 dark:text-parchment-100/90">{item.message}</p>
            </article>
          ))}
        </div>
      )}
    </ModalShell>
  )
}
