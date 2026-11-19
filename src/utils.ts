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
