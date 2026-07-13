import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api'
import type { PlaylistLink } from '../types'

/** GET /api/links — the saved cross-service playlist pairings. */
export function useLinks() {
  const [links, setLinks] = useState<PlaylistLink[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getLinks()
      setLinks(data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { links, loading, error, refresh }
}
