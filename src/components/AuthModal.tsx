import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { api, type CaptchaChallenge } from '../api'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { ModalShell } from './Common'
import { compressImage } from '../utils'

type Mode = 'login' | 'register'

interface AuthModalProps {
  registrationOpen: boolean
}

export default function AuthModal({ registrationOpen }: AuthModalProps) {
  const { t } = useLocale()
  const { toast } = useToast()
  const { authOpen, authMode, openAuth, closeAuth, login, register } = useAuth()
  const [mode, setMode] = useState<Mode>(authMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [penName, setPenName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [loading, setLoading] = useState(false)
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
    if (!authOpen) return
    setMode(authMode === 'register' && !registrationOpen ? 'login' : authMode)
  }, [authOpen, authMode, registrationOpen])
  useEffect(() => {
    if (authOpen && mode === 'register') void loadCaptcha()
  }, [authOpen, mode, loadCaptcha])
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function switchMode(next: Mode) {
    if (next === 'register' && !registrationOpen) {
      toast(t('admin.signupsClosed'), 'info')
      return
    }
    setMode(next)
    openAuth(next)
  }

  async function chooseAvatar(file: File | undefined) {
    if (!file) return
    const name = file.name.toLowerCase()
    if (file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/.test(name)) {
      toast(t('composer.videoError'), 'error')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast(t('composer.imageError'), 'error')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast(t('file.tooLarge'), 'error')
      return
    }
    const compressed = await compressImage(file)
    setAvatar(compressed)
    setPreview(URL.createObjectURL(compressed))
  }

  async function submit() {
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        const data = new FormData()
        data.set('authorName', authorName.trim())
        data.set('penName', penName.trim())
        data.set('email', email.trim())
        data.set('password', password)
        data.set('bio', bio.trim())
        data.set('captchaId', captcha?.captchaId ?? '')
        data.set('captchaAnswer', captchaAnswer.trim())
        data.set('website', '')
        if (avatar) data.set('avatar', avatar)
        await register(data)
      }
      setPassword('')
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setLoading(false)
      if (mode === 'register') void loadCaptcha()
    }
  }

  return (
    <ModalShell
      open={authOpen}
      onClose={closeAuth}
      title={mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
      subtitle={mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-parchment-100 p-1 dark:bg-ink-800/60">
        {(['login', 'register'] as Mode[]).map((option) => (
          <button
            key={option}
            type="button"
            disabled={option === 'register' && !registrationOpen}
            onClick={() => switchMode(option)}
            className={`rounded-lg py-2 text-xs font-bold transition ${mode === option ? 'bg-white text-terracotta-600 shadow-sm dark:bg-ink-700 dark:text-gold-400' : 'text-ink-700/55 dark:text-parchment-200/50'}`}
          >
            {option === 'login' ? t('nav.signIn') : t('nav.join')}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-3.5">
        {mode === 'register' && (
          <>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => fileInput.current?.click()} className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-parchment-300 bg-parchment-100 text-ink-700/50 transition hover:border-terracotta-500 dark:border-ink-700 dark:bg-ink-800">
                {preview ? <img src={preview} alt={t('auth.avatarLabel')} className="h-full w-full object-cover" /> : <Camera className="h-5 w-5" />}
              </button>
              <div>
                <p className="text-xs font-semibold text-ink-900 dark:text-parchment-50">{t('auth.avatarLabel')}</p>
                <p className="text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('auth.avatarHint')}</p>
              </div>
              <input ref={fileInput} type="file" accept="image/*,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(event) => { chooseAvatar(event.target.files?.[0]); event.target.value = '' }} />
            </div>
            <div>
              <label className="label" htmlFor="author-name">{t('auth.authorName')}</label>
              <input id="author-name" className="input" value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder={t('auth.authorNamePlaceholder')} required />
            </div>
            <div>
              <label className="label" htmlFor="pen-name">{t('auth.penName')}</label>
              <input id="pen-name" className="input" value={penName} onChange={(event) => setPenName(event.target.value)} placeholder={t('auth.penNamePlaceholder')} required />
            </div>
          </>
        )}

        <div>
          <label className="label" htmlFor="auth-email">{t('auth.email')}</label>
          <input id="auth-email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('auth.emailPlaceholder')} required />
        </div>
        <div>
          <label className="label" htmlFor="auth-password">{t('auth.password')}</label>
          <input id="auth-password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('auth.passwordPlaceholder')} minLength={6} required />
        </div>
        {mode === 'register' && (
          <>
            <div>
              <label className="label" htmlFor="auth-bio">{t('auth.bio')}</label>
              <textarea id="auth-bio" rows={2} className="input resize-none" value={bio} onChange={(event) => setBio(event.target.value)} placeholder={t('auth.bioPlaceholder')} />
            </div>
            <div className="rounded-xl border border-dashed border-parchment-300 p-3 dark:border-ink-700">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink-700/60 dark:text-parchment-200/55">{t('auth.captchaLabel')}</p>
                <button type="button" onClick={() => void loadCaptcha()} className="btn-ghost !py-1 text-[11px]">
                  <RefreshCw className="h-3 w-3" /> {t('auth.refreshCaptcha')}
                </button>
              </div>
              <label className="label mt-2" htmlFor="auth-captcha">{captcha?.question ?? t('common.loading')}</label>
              <input id="auth-captcha" className="input" inputMode="numeric" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} required />
            </div>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          </>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? t('common.loading') : mode === 'login' ? t('auth.loginButton') : t('auth.registerButton')}
        </button>
      </form>

      <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="mt-4 flex w-full items-center justify-center gap-1 text-xs font-semibold text-terracotta-600 hover:underline dark:text-gold-400">
        {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
      </button>
    </ModalShell>
  )
}
