import type { TranslationKey } from './i18n'

export function timeAgo(
  value: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const normalized = /T/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const timestamp = new Date(normalized).getTime()
  if (Number.isNaN(timestamp)) return t('common.justNow')
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('common.hoursAgo', { count: hours })
  return t('common.daysAgo', { count: Math.floor(hours / 24) })
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
}

export async function compressImage(file: File): Promise<File> {
  if (typeof createImageBitmap === 'undefined' || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob || blob.size >= file.size) return file
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.webp`
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}
