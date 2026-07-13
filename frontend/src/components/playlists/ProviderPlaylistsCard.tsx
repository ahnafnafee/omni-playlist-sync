import { Link } from 'react-router-dom'

import type { ProviderPlaylistsEntry } from '@/hooks/useProviderPlaylists'
import { cn } from '@/lib/cn'
import type { Account } from '@/types'

import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { LoadingStatus, Skeleton } from '../ui/Skeleton'
import { StatusPill } from '../ui/StatusPill'
import { BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES, BUTTON_VARIANT_CLASSES } from '../ui/buttonStyles'

/** One provider's playlists for the Browse section. Handles all four states
 * explicitly: not connected, loading, errored, and loaded (possibly empty). */
export function ProviderPlaylistsCard({ account, entry }: { account: Account; entry: ProviderPlaylistsEntry | undefined }) {
  const connected = account.state === 'connected'

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      {/* Stacked, not side-by-side — at the 4-across desktop breakpoint a
          longer name + pill ("YouTube Music" + "Needs reconnect") don't
          both fit on one line, and a flex row would either truncate a
          legible provider name or need finicky wrap tuning. Giving the
          title its own full-width line first avoids both. */}
      <div className="flex flex-col items-start gap-1.5">
        <h3 className="w-full truncate text-base font-semibold text-slate-900 dark:text-slate-100">{account.name}</h3>
        <StatusPill state={account.state} />
      </div>

      {!connected ? (
        <EmptyState
          className="py-6"
          title="Not connected"
          description="Connect this service to browse its playlists."
          action={
            <Link to="/accounts" className={cn(BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES.sm, BUTTON_VARIANT_CLASSES.secondary)}>
              Go to Accounts
            </Link>
          }
        />
      ) : !entry || (entry.loading && entry.playlists.length === 0) ? (
        <LoadingStatus label={`Loading ${account.name} playlists…`}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </LoadingStatus>
      ) : entry.error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load playlists: {entry.error}</p>
      ) : entry.playlists.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {entry.playlists.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{p.name}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {p.count} track{p.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="py-6" title="No playlists found" description="This service doesn't have any playlists yet." />
      )}
    </Card>
  )
}
