import { useState } from 'react'

import { api, errorMessage } from '@/api'
import type { ProviderPlaylistsEntry } from '@/hooks/useProviderPlaylists'
import { cn } from '@/lib/cn'
import type { Account, PlaylistLink } from '@/types'

import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'

function providerName(accounts: Account[], id: string): string {
  return accounts.find((a) => a.id === id)?.name ?? id
}

/** Resolves a member's playlist id back to a display name using the Browse
 * data; falls back to the raw id if that provider's playlists haven't
 * loaded (or the playlist has since been removed on the service). */
function playlistLabel(entries: Record<string, ProviderPlaylistsEntry>, providerId: string, playlistId: string | null): string {
  if (playlistId === null) return 'Create new (same name)'
  return entries[providerId]?.playlists.find((p) => p.id === playlistId)?.name ?? playlistId
}

interface LinkCardProps {
  link: PlaylistLink
  accounts: Account[]
  playlistEntries: Record<string, ProviderPlaylistsEntry>
  onEdit: () => void
  onChanged: () => void
}

export function LinkCard({ link, accounts, playlistEntries, onEdit, onChanged }: LinkCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.deleteLink(link.id)
      setConfirmingDelete(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const memberEntries = Object.entries(link.members)

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{link.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              link.direction === 'nway'
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {link.direction === 'nway' ? 'Bidirectional' : 'One-way'}
          </span>
          {!link.enabled && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Paused
            </span>
          )}
        </div>
      </div>

      {memberEntries.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {memberEntries.map(([providerId, playlistId]) => {
            const isSource = link.direction === 'oneway' && link.source === providerId
            return (
              <li key={providerId} className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {providerName(accounts, providerId)}
                  {isSource && (
                    <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      Source
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate text-right font-medium text-slate-700 dark:text-slate-200">
                  {playlistLabel(playlistEntries, providerId, playlistId)}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-500">No services included yet.</p>
      )}

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${link.name}"?`}
        description="This removes the pairing. Playlists and tracks already on each service are untouched."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Card>
  )
}
