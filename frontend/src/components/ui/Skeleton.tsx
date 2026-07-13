import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** A single placeholder block. Compose a few inside `LoadingStatus` so
 * screen readers get a loading announcement instead of silence. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-slate-200 dark:bg-slate-800', className)} />
}

/** Wraps skeleton placeholders in an `aria-live` status region with a
 * visually-hidden label, so assistive tech announces "Loading…" once instead
 * of reading through invisible placeholder markup. */
export function LoadingStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
