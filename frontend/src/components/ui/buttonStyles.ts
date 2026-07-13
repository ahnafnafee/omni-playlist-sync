export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

// `min-h-11` (44px) is unconditional — not gated behind a breakpoint — so
// every button meets a touch-friendly minimum tap height everywhere, not
// just under a viewport-width guess. Padding/font-size (which DO vary by
// size) live in BUTTON_SIZE_CLASSES instead of here, on purpose: mixing a
// "default" padding into the base classes and then trying to override it via
// a one-off className is NOT safe in Tailwind — utilities of the same
// property are ordered by Tailwind's internal stylesheet order, not by where
// they appear in the `class` attribute, so a later className override can
// silently lose the cascade. Keeping each size's classes mutually exclusive
// (only one set ever applied) sidesteps that footgun entirely.
export const BUTTON_BASE_CLASSES =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
}

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 disabled:hover:bg-brand-600',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-brand-600 ' +
    'dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 disabled:hover:bg-rose-600',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-brand-600 ' +
    'dark:text-slate-300 dark:hover:bg-slate-800',
}
