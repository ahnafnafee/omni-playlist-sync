import { useDarkMode } from '@/hooks/useDarkMode'

import { Toggle } from '../ui/Toggle'

/** Light/dark switch. Lives on the Settings page; applies instantly and persists
 * to localStorage (see useDarkMode). Dark is the default. */
export function ThemeToggle() {
  const [dark, toggle] = useDarkMode()
  return <Toggle checked={dark} onChange={toggle} label="Dark theme" />
}
