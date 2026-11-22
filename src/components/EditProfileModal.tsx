import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { resolveAppUrl } from '../config'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { ModalShell } from './Common'
import { compressImage } from '../utils'

export default function EditProfileModal() {
  const { t } = useLocale()
  const { toast } = useToast()
  const { user, profileOpen, closeProfile, updateProfile } = useAuth()
  const [authorName, setAuthorName] = useState('')
  const [penName, setPenName] = useState('')
  const [bio, setBio] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user || !profileOpen) return
    setAuthorName(user.authorName)
    setPenName(user.penName)
    setBio(user.bio)
    setAvatar(null)
    setPreview(null)
  }, [user, profileOpen])

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

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
      const data = new FormData()
      data.set('authorName', authorName.trim())
      data.set('penName', penName.trim())
      data.set('bio', bio.trim())
      if (avatar) data.set('avatar', avatar)
      await updateProfile(data)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell open={profileOpen} onClose={closeProfile} title={t('profile.title')} subtitle={t('profile.subtitle')}>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-3.5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileInput.current?.click()} className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-parchment-300 bg-parchment-100 text-ink-700/50 transition hover:border-terracotta-500 dark:border-ink-700 dark:bg-ink-800">
            {preview || user?.avatarUrl
              ? <img src={resolveAppUrl(preview ?? user?.avatarUrl ?? '')} alt={t('profile.avatar')} className="h-full w-full object-cover" />
              : <Camera className="h-5 w-5" />}
          </button>
          <div>
            <p className="text-xs font-semibold text-ink-900 dark:text-parchment-50">{t('profile.avatar')}</p>
            <p className="text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('auth.avatarHint')}</p>
          </div>
          <input ref={fileInput} type="file" accept="image/*,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(event) => { chooseAvatar(event.target.files?.[0]); event.target.value = '' }} />
        </div>
        <div>
          <label className="label" htmlFor="profile-author">{t('profile.authorName')}</label>
          <input id="profile-author" className="input" value={authorName} onChange={(event) => setAuthorName(event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="profile-pen">{t('profile.penName')}</label>
          <input id="profile-pen" className="input" value={penName} onChange={(event) => setPenName(event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="profile-bio">{t('profile.bio')}</label>
          <textarea id="profile-bio" rows={3} className="input resize-none" value={bio} onChange={(event) => setBio(event.target.value)} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={closeProfile} className="btn-secondary flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('profile.save')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
