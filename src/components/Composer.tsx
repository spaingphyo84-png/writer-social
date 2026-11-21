import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { BookOpen, Feather, ImagePlus, Layers3, Loader2, PenLine, RefreshCw, X } from 'lucide-react'
import { api, type CaptchaChallenge } from '../api'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { Category } from '../i18n'
import type { Post } from '../types'
import { Avatar, PenBadge } from './Common'

const categories: { key: Category; icon: typeof Feather; active: string }[] = [
  { key: 'poem', icon: Feather, active: 'text-rose-600 border-rose-500 dark:text-rose-400' },
  { key: 'story', icon: BookOpen, active: 'text-emerald-600 border-emerald-500 dark:text-emerald-400' },
  { key: 'general', icon: Layers3, active: 'text-sky-600 border-sky-500 dark:text-sky-400' },
]

const placeholderKeys = {
  poem: { title: 'composer.titlePlaceholderPoem', body: 'composer.bodyPlaceholderPoem' },
  story: { title: 'composer.titlePlaceholderStory', body: 'composer.bodyPlaceholderStory' },
  general: { title: 'composer.titlePlaceholderGeneral', body: 'composer.bodyPlaceholderGeneral' },
} as const

interface ComposerProps {
  onCreated: (post: Post) => void
  focusSignal: number
  focusRef: RefObject<HTMLTextAreaElement | null>
}

export default function Composer({ onCreated, focusSignal, focusRef }: ComposerProps) {
  const { t } = useLocale()
  const { user, openAuth } = useAuth()
  const { toast } = useToast()
  const [category, setCategory] = useState<Category>('poem')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptcha(await api.captcha())
      setCaptchaAnswer('')
    } catch {
      setCaptcha(null)
    }
  }, [])

  useEffect(() => {
    if (expanded && user) void loadCaptcha()
  }, [expanded, user, loadCaptcha])

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (focusSignal === 0) return
    setExpanded(true)
    window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      focusRef.current?.focus()
    }, 60)
  }, [focusSignal, focusRef])

  function reset() {
    setTitle('')
    setBody('')
    setFile(null)
    setPreview(null)
    setExpanded(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  function handleFile(selected: File | undefined) {
    if (!selected) return
    const name = selected.name.toLowerCase()
    const isVideo = selected.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|m4v|ogv|3gp|wmv|flv)$/.test(name)
    if (isVideo) {
      toast(t('composer.videoError'), 'error')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || !/\.(jpe?g|png|webp)$/.test(name)) {
      toast(t('composer.imageError'), 'error')
      return
    }
    if (selected.size > 2 * 1024 * 1024) {
      toast(t('file.tooLarge'), 'error')
      return
    }
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  async function submit() {
    if (!user) {
      toast(t('post.loginToReact'), 'info')
      openAuth('login')
      return
    }
    if (!title.trim()) return toast(t('composer.titleRequired'), 'error')
    if (!body.trim()) return toast(t('composer.bodyRequired'), 'error')

    setSubmitting(true)
    try {
      const data = new FormData()
      data.set('category', category)
      data.set('title', title.trim())
      data.set('body', body.trim())
      data.set('captchaId', captcha?.captchaId ?? '')
      data.set('captchaAnswer', captchaAnswer.trim())
      data.set('website', '')
      if (file) data.set('image', file)
      const result = await api.createPost(data)
      onCreated(result.post)
      reset()
      toast(t('composer.success'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSubmitting(false)
      void loadCaptcha()
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-parchment-200 px-4 py-3.5 dark:border-ink-800 sm:px-5">
        <Avatar name={user?.authorName ?? t('post.unknownWriter')} url={user?.avatarUrl} size="md" />
        <button
          type="button"
          onClick={() => { setExpanded(true); window.setTimeout(() => focusRef.current?.focus(), 30) }}
          className="flex-1 rounded-full border border-parchment-300 bg-parchment-50 px-4 py-2.5 text-left text-sm text-ink-700/55 transition hover:border-terracotta-400 dark:border-ink-700 dark:bg-ink-950 dark:text-parchment-200/45"
        >
          {t('composer.prompt')}
        </button>
        <PenLine className="hidden h-4 w-4 text-terracotta-500 sm:block" />
      </div>

      {expanded && (
        <div className="animate-fade-up px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-4 flex gap-1.5 border-b border-parchment-200 dark:border-ink-800">
            {categories.map(({ key, icon: Icon, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-xs font-semibold transition sm:px-3.5 ${
                  category === key ? active : 'border-transparent text-ink-700/55 hover:text-ink-900 dark:text-parchment-200/50 dark:hover:text-parchment-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t(`category.${key}`)}
              </button>
            ))}
          </div>

          {user && <div className="mb-3"><PenBadge name={user.penName} /></div>}

          <label className="label" htmlFor="post-title">{t('composer.title')}</label>
          <input
            id="post-title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t(placeholderKeys[category].title)}
            className="input mb-3 font-serif text-base"
          />
          <textarea
            ref={focusRef}
            value={body}
            maxLength={20000}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t(placeholderKeys[category].body)}
            rows={category === 'story' ? 8 : 6}
            className="input resize-y leading-relaxed"
          />

          <div className="mt-3 rounded-xl border border-dashed border-parchment-300 p-3 dark:border-ink-700">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-ink-700/60 dark:text-parchment-200/55">{t('auth.captchaLabel')}</p>
              <button type="button" onClick={() => void loadCaptcha()} className="btn-ghost !py-1 text-[11px]">
                <RefreshCw className="h-3 w-3" /> {t('auth.refreshCaptcha')}
              </button>
            </div>
            <label className="label mt-2" htmlFor="post-captcha">{captcha?.question ?? t('common.loading')}</label>
            <input id="post-captcha" className="input" inputMode="numeric" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} required />
          </div>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          {preview && (
            <div className="relative mt-3 overflow-hidden rounded-xl border border-parchment-200 dark:border-ink-700">
              <img src={preview} alt={t('post.imageAlt')} className="max-h-64 w-full object-cover" />
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); if (fileInput.current) fileInput.current.value = '' }}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-ink-950"
              >
                <X className="h-3 w-3" /> {t('composer.removeImage')}
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-parchment-200 pt-3.5 dark:border-ink-800">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = '' }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary !py-2 text-xs">
              <ImagePlus className="h-4 w-4" /> {t('composer.attachImage')}
            </button>
            <span className="hidden text-[11px] text-ink-700/45 dark:text-parchment-200/40 sm:inline">{t('composer.hint')}</span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setExpanded(false)} className="btn-ghost !py-2 text-xs">{t('common.cancel')}</button>
              <button type="button" onClick={submit} disabled={submitting || !title.trim() || !body.trim() || !captchaAnswer.trim()} className="btn-primary !py-2 text-xs">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                {submitting ? t('composer.publishing') : t('composer.publish')}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-700/45 dark:text-parchment-200/40 sm:hidden">{t('composer.hint')}</p>
        </div>
      )}
    </section>
  )
}
