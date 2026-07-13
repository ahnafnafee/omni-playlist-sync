/** Tiny classname joiner — keeps conditional Tailwind class lists readable
 * without pulling in `clsx`/`tailwind-merge`. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
