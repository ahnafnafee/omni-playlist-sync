import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import type { TargetSummary } from '@/types'

const STAT_STYLES = {
  added: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30',
  removed: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/30',
  missing: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800',
  held: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30',
  deferred: 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-900/30',
  created: 'text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30',
  skipped: 'text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-800',
} as const

function Stat({ styleKey, children }: { styleKey: keyof typeof STAT_STYLES; children: ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STAT_STYLES[styleKey])}>{children}</span>
}

/** One service's results from the last sync pass — always shows the primary
 * added/removed counts, and only surfaces the rest (not found, held back,
 * deferred, created, unchanged) when they're non-zero, to keep a clean
 * playlist from being buried in zeros. */
export function TargetSummaryChip({ target }: { target: TargetSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{target.name}</p>
      <div className="flex flex-wrap gap-1.5">
        <Stat styleKey="added">+{target.added} added</Stat>
        <Stat styleKey="removed">-{target.removed} removed</Stat>
        {target.missing > 0 && <Stat styleKey="missing">{target.missing} not found</Stat>}
        {target.held > 0 && <Stat styleKey="held">{target.held} held back</Stat>}
        {target.deferred > 0 && <Stat styleKey="deferred">{target.deferred} deferred</Stat>}
        {target.created > 0 && (
          <Stat styleKey="created">
            {target.created} playlist{target.created === 1 ? '' : 's'} created
          </Stat>
        )}
        {target.skipped > 0 && <Stat styleKey="skipped">{target.skipped} unchanged</Stat>}
      </div>
    </div>
  )
}
