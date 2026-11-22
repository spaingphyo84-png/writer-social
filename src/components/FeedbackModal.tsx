import { useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { ModalShell } from './Common'

type FeedbackCategory = 'suggestion' | 'bug' | 'other'

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale()
  const { user, openAuth } = useAuth()
  const { toast } = useToast()
  const [category, setCategory] = useState<FeedbackCategory>('suggestion')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (!user) {
      onClose()
      openAuth('login')
      return
    }
    if (!message.trim()) return
    setSending(true)
    try {
      await api.submitFeedback(category, message.trim())
      setMessage('')
      onClose()
      toast(t('feedback.success'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title={t('feedback.title')} subtitle={t('feedback.subtitle')}>
      <label className="label" htmlFor="feedback-category">{t('feedback.category')}</label>
      <select
        id="feedback-category"
        value={category}
        onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
        className="input mb-4"
      >
        <option value="suggestion">{t('feedback.suggestion')}</option>
        <option value="bug">{t('feedback.bug')}</option>
        <option value="other">{t('feedback.other')}</option>
      </select>

      <label className="label" htmlFor="feedback-message">{t('feedback.message')}</label>
      <textarea
        id="feedback-message"
        value={message}
        maxLength={2000}
        rows={6}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t('feedback.placeholder')}
        className="input resize-y leading-relaxed"
      />
      <p className="mt-1 text-right text-[10px] text-ink-700/45 dark:text-parchment-200/40">{message.length}/2000</p>
      <p className="mt-1 text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('feedback.limit')}</p>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary !py-2 text-xs">{t('common.cancel')}</button>
        <button type="button" onClick={() => void submit()} disabled={sending || !message.trim()} className="btn-primary !py-2 text-xs">
          {sending ? t('feedback.sending') : <Send className="h-3.5 w-3.5" />}
          {sending ? '' : t('feedback.submit')}
        </button>
      </div>
    </ModalShell>
  )
}
