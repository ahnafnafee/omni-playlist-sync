import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/cn'

import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS: Array<{ to: string; label: string; end: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/accounts', label: 'Accounts', end: false },
  { to: '/playlists', label: 'Playlists', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu with Escape, and if the viewport is resized past
  // the breakpoint where the inline nav takes over (e.g. rotating a tablet).
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const mql = window.matchMedia('(min-width: 768px)')
    function onBreakpointChange() {
      if (mql.matches) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    mql.addEventListener('change', onBreakpointChange)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      mql.removeEventListener('change', onBreakpointChange)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Logo />
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
            Omni Playlist Sync
          </span>
        </div>

        {/* Tablet/desktop: inline pill nav. */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-900 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  isActive
                    ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-800 dark:text-brand-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {/* Phone/small-tablet: hamburger toggle for the nav below. */}
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Phone/small-tablet: expanded nav panel. */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-slate-200 px-4 pb-3 dark:border-slate-800 md:hidden"
        >
          <ul className="flex flex-col gap-1 pt-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center rounded-lg px-3 text-base font-medium',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <path d="M9 13a7 7 0 0 1 12.02-4.9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path
        d="M21.5 6.5v3.6h-3.6"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M23 19a7 7 0 0 1-12.02 4.9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path
        d="M10.5 25.5v-3.6h3.6"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2.5 5.5A.75.75 0 0 1 3.25 4.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 5.5ZM2.5 10a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25A.75.75 0 0 1 2.5 10ZM2.5 14.5a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H3.25a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}
