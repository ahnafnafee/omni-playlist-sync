import { cn } from '@/lib/cn'

export const FIELD_INPUT_CLASSES = cn(
  'w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm placeholder:text-slate-400',
  // 16px on mobile — iOS Safari auto-zooms the viewport on focus for any
  // input with a computed font-size under 16px. Desktop can afford the
  // slightly denser 14px once viewport width (and therefore likely a mouse)
  // is available.
  'text-base text-slate-900 sm:text-sm',
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/60',
)
