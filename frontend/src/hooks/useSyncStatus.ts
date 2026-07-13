import { useCallback, useEffect, useRef, useState } from 'react'

import { api, errorMessage } from '../api'
import type { SyncStatus } from '../types'

const POLL_MS = 4000

/** Polls GET /api/sync/status on an interval. A running/scheduled pass has no
 * push channel of its own (the live feed is separate over SSE), so short
 * polling keeps the status card current without much chatter. */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await api.getSyncStatus()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  return { status, error, refresh }
}
