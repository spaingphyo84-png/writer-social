import { useEffect, useRef, useState } from 'react'
import { BookOpen, Feather, ImagePlus, Layers3, Loader2, X } from 'lucide-react'
import { api } from '../api'
import { resolveAppUrl } from '../config'
import { useLocale } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import type { Category } from '../i18n'
import type { Post } from '../types'
import { ModalShell } from './Common'

const categories: { key: Category; icon: typeof Feather; active: string }[] = [
  { key: 'poem', icon: Feather, active: 'text-rose-600 border-rose-500 dark:text-rose-400' },
  { key: 'story', icon: BookOpen, active: 'text-emerald-600 border-emerald-500 dark:text-emerald-400' },
  { key: 'general', icon: Layers3, active: 'text-sky-600 border-sky-500 dark:text-sky-400' },
]

interface EditPostModalProps {
  post: Post
  open: boolean
  onClose: () => void
  onSaved: (post: Post) => void
}

export default function EditPostModal({ post, open, onClose, onSaved }: EditPostModalProps) {
  const { t } = useLocale()
  const { toast } = useToast()
  const [category, setCategory] = useState<Category>(post.category)
  const [title, setTitle] = useState(post.title)
  const [body, setBody] = useState(post.body)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setCategory(post.category)
    setTitle(post.title)
    setBody(post.body)
    setFile(null)
    setPreview(null)
    setRemoveImage(false)
    if (fileInput.current) fileInput.current.value = ''
  }, [open, post])

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

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
    setRemoveImage(false)
  }

  function clearImage() {
    setFile(null)
    setPreview(null)
    setRemoveImage(true)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function save() {
    if (!title.trim()) return toast(t('composer.titleRequired'), 'error')
    if (!body.trim()) return toast(t('composer.bodyRequired'), 'error')

    setSaving(true)
    try {
      const data = new FormData()
      data.set('title', title.trim())
      data.set('content', body.trim())
      data.set('category', category)
      if (file) data.set('image', file)
      else if (removeImage) data.set('removeImage', 'true')
      const result = await api.updatePost(post.id, data)
      onSaved(result.post)
      toast(t('post.updated'))
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title={t('post.editorTitle')} subtitle={t('post.editorSubtitle')}>
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

      <label className="label" htmlFor={`edit-post-title-${post.id}`}>{t('composer.title')}</label>
      <input
        id={`edit-post-title-${post.id}`}
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        className="input mb-3 font-serif text-base"
      />
      <textarea
        value={body}
        maxLength={20000}
        onChange={(event) => setBody(event.target.value)}
        rows={8}
        className="input resize-y leading-relaxed"
      />

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

      {!preview && post.imageUrl && !removeImage && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-parchment-200 dark:border-ink-700">
          <img src={resolveAppUrl(post.imageUrl)} alt={t('post.imageAlt')} className="max-h-64 w-full object-cover" />
          <button
            type="button"
            onClick={clearImage}
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
          <ImagePlus className="h-4 w-4" /> {t('post.replaceImage')}
        </button>
        <span className="text-[11px] text-ink-700/50 dark:text-parchment-200/45">{t('composer.hint')}</span>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('common.save')}
        </button>
      </div>
    </ModalShell>
  )
}
