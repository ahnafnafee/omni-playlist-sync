import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api'
import type { ProviderPlaylist } from '../types'

export interface ProviderPlaylistsEntry {
  playlists: ProviderPlaylist[]
  loading: boolean
  error: string | null
}

/** Fetches GET /api/playlists?provider=<id> for each given provider id, in
 * parallel, tracking per-provider loading/error state independently — one
 * provider being slow or erroring shouldn't blank out the others.
 *
 * `providerIds` is expected to already be the "browse-worthy" set (callers
 * typically pass connected account ids); pass a stable/memoized array to
 * avoid re-fetching every render — this hook itself only re-runs when the
 * *set* of ids actually changes (compared as a sorted, joined key), not on
 * every new array reference. */
export function useProviderPlaylists(providerIds: string[]) {
  const idsKey = providerIds.slice().sort().join(',')
  const [entries, setEntries] = useState<Record<string, ProviderPlaylistsEntry>>({})

  const refresh = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : []

    setEntries((prev) => {
      const next: Record<string, ProviderPlaylistsEntry> = {}
      for (const id of ids) {
        next[id] = { playlists: prev[id]?.playlists ?? [], loading: true, error: null }
      }
      return next
    })

    await Promise.all(
      ids.map(async (id) => {
        try {
          const playlists = await api.getPlaylists(id)
          setEntries((prev) => ({ ...prev, [id]: { playlists, loading: false, error: null } }))
        } catch (err) {
          setEntries((prev) => ({
            ...prev,
            [id]: { playlists: prev[id]?.playlists ?? [], loading: false, error: errorMessage(err) },
          }))
        }
      }),
    )
  }, [idsKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { entries, refresh }
}
