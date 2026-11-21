import { useState } from 'react'
import { Feather, Globe2, LogOut, Moon, PenLine, Search, Sun, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/SettingsContext'
import { useTheme } from '../context/SettingsContext'
import { Avatar, PenBadge } from './Common'

interface HeaderProps {
  search: string
  onSearchChange: (value: string) => void
  onWrite: () => void
  registrationOpen: boolean
  onToggleRegistration?: () => void
  togglingRegistration?: boolean
}

export default function Header({ search, onSearchChange, onWrite, registrationOpen, onToggleRegistration, togglingRegistration }: HeaderProps) {
  const { t, locale, setLocale } = useLocale()
  const { theme, toggleTheme } = useTheme()
  const { user, openAuth, openProfile, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-parchment-200/90 bg-parchment-50/85 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-950/85">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-3 sm:gap-5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-terracotta-500 to-gold-500 text-white shadow-sm">
            <Feather className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-[15px] font-bold leading-tight text-ink-900 dark:text-parchment-50 sm:text-base">
              {t('app.name')}
            </p>
            <p className="hidden truncate text-[10px] tracking-wide text-ink-700/50 dark:text-parchment-200/45 lg:block">{t('app.tagline')}</p>
          </div>
        </div>

        <label className="relative ml-auto hidden min-w-0 max-w-xs flex-1 sm:block lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-700/40 dark:text-parchment-200/35" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('header.search')}
            className="input !rounded-full !py-2 pl-9 text-xs"
          />
        </label>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          <div className="flex items-center rounded-full border border-parchment-300 bg-parchment-50 p-0.5 dark:border-ink-700 dark:bg-ink-900">
            <Globe2 className="ml-1.5 hidden h-3.5 w-3.5 text-ink-700/45 sm:block dark:text-parchment-200/40" />
            {(['en', 'my'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLocale(option)}
                aria-pressed={locale === option}
                className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase transition ${locale === option
                  ? 'bg-terracotta-500 text-white shadow-sm'
                  : 'text-ink-700/60 hover:text-ink-900 dark:text-parchment-200/60 dark:hover:text-parchment-50'}`}
              >
                {option === 'en' ? 'EN' : 'MY'}
              </button>
            ))}
          </div>

          <button type="button" onClick={toggleTheme} aria-label={t('header.theme')} className="icon-btn border border-parchment-300 bg-parchment-50 dark:border-ink-700 dark:bg-ink-900">
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px] text-gold-400" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          {user?.isAdmin && onToggleRegistration && (
            <button
              type="button"
              onClick={onToggleRegistration}
              disabled={togglingRegistration}
              className={`rounded-full px-3 py-2 text-[11px] font-bold text-white transition disabled:opacity-60 ${registrationOpen ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              title={t(registrationOpen ? 'admin.signupsOpen' : 'admin.signupsLocked')}
            >
              {t(registrationOpen ? 'admin.signupsOpen' : 'admin.signupsLocked')}
            </button>
          )}

          {user ? (
            <>
              <button type="button" onClick={onWrite} className="btn-primary !px-2.5 !py-2 sm:!px-4" title={t('nav.write')}>
                <PenLine className="h-4 w-4" />
                <span className="hidden sm:inline">{t('nav.write')}</span>
              </button>
              <div className="relative">
                <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex items-center rounded-full ring-2 ring-transparent transition hover:ring-terracotta-400/50">
                  <Avatar name={user.authorName} url={user.avatarUrl} size="md" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="card absolute right-0 z-20 mt-2 w-60 animate-fade-up p-2">
                      <div className="flex items-center gap-2.5 rounded-xl bg-parchment-100 p-2.5 dark:bg-ink-800/60">
                        <Avatar name={user.authorName} url={user.avatarUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-900 dark:text-parchment-50">{user.authorName}</p>
                          <PenBadge name={user.penName} />
                        </div>
                      </div>
                      <button type="button" onClick={() => { setMenuOpen(false); openProfile() }} className="btn-ghost mt-1 w-full !justify-start">
                        <UserRound className="h-4 w-4" /> {t('nav.editProfile')}
                      </button>
                      <button type="button" onClick={() => { setMenuOpen(false); logout() }} className="btn-ghost w-full !justify-start text-red-600 dark:text-red-400">
                        <LogOut className="h-4 w-4" /> {t('nav.signOut')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => openAuth('login')} className="btn-ghost !px-2 sm:!px-4">
                <UserRound className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">{t('nav.signIn')}</span>
              </button>
              {registrationOpen && (
                <button type="button" onClick={() => openAuth('register')} className="btn-primary !px-2.5 !py-2 sm:!px-4">
                  <PenLine className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav.join')}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
