import { cn } from '@/lib/cn'
import { formatDuration, formatInterval } from '@/lib/format'
import type { SyncStatus } from '@/types'

import { Button } from '../ui/Button'
import { LoadingStatus, Skeleton } from '../ui/Skeleton'
import { TargetSummaryChip } from './TargetSummaryChip'

interface Props {
  status: SyncStatus | null
  error: string | null
  onToggleSchedule: () => void
  scheduleBusy: boolean
}

export function SyncStatusSummary({ status, error, onToggleSchedule, scheduleBusy }: Props) {
  if (!status) {
    if (error) {
      return <p className="text-sm text-rose-600 dark:text-rose-400">Could not load sync status: {error}</p>
    }
    return (
      <LoadingStatus label="Loading sync status…">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      </LoadingStatus>
    )
  }

  const last = status.last

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2.5 rounded-full',
              status.running ? 'animate-pulse bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
            )}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {status.running ? 'Sync running…' : 'Idle'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{status.scheduled ? `Auto-sync every ${formatInterval(status.interval_s)}` : 'Auto-sync paused'}</span>
          <Button variant="ghost" size="sm" onClick={onToggleSchedule} loading={scheduleBusy}>
            {status.scheduled ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      {last ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                last.execute
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {last.execute ? 'Applied' : 'Dry run'}
            </span>
            <span>{last.mode === 'nway' ? 'Bidirectional (N-way)' : 'One-way from Spotify'}</span>
            <span>· took {formatDuration(last.duration_s)}</span>
            {!last.ok && <span className="font-medium text-rose-600 dark:text-rose-400">· pass failed</span>}
          </div>
          {last.error && <p className="text-sm text-rose-600 dark:text-rose-400">{last.error}</p>}
          {last.per_target.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {last.per_target.map((t) => (
                <TargetSummaryChip key={t.name} target={t} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing was synced on the last pass.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">No sync has run yet — run one now to see results here.</p>
      )}
    </div>
  )
}
