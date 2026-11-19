import { Capacitor } from '@capacitor/core'

export const NATIVE_API_ORIGIN = 'https://writer-social.onrender.com'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function appOrigin(): string {
  return isNativeApp() ? NATIVE_API_ORIGIN : window.location.origin
}

export function resolveAppUrl(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path) || !path.startsWith('/')) return path
  return isNativeApp() ? `${NATIVE_API_ORIGIN}${path}` : path
}
