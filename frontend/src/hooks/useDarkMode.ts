import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'omni-theme'

function getInitialDark(): boolean {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Class-based dark mode (see the `@custom-variant dark` in index.css) with a
 * persisted user override; falls back to the OS preference on first visit. */
export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(getInitialDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }, [dark])

  const toggle = useCallback(() => setDark((d) => !d), [])

  return [dark, toggle]
}
