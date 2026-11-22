import { MessageSquareText } from 'lucide-react'
import { useLocale } from '../context/SettingsContext'

export default function Footer({ onOpenFeedback }: { onOpenFeedback: () => void }) {
  const { t } = useLocale()
  return (
    <footer className="mx-auto mt-4 flex max-w-[1440px] flex-col items-center justify-between gap-2 border-t border-parchment-200 px-4 py-5 text-center dark:border-ink-800 sm:flex-row sm:px-5 sm:text-left">
      <p className="text-[11px] font-medium text-ink-700/45 dark:text-parchment-200/35">
        {t('footer.developedBy')}
      </p>
      <button
        type="button"
        onClick={onOpenFeedback}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-700/55 transition hover:text-terracotta-600 dark:text-parchment-200/45 dark:hover:text-gold-400"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        {t('feedback.button')}
      </button>
    </footer>
  )
}
