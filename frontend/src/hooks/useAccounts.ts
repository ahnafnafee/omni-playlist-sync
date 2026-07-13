import { useCallback, useEffect, useState } from 'react'

import { api, errorMessage } from '../api'
import type { Account } from '../types'

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getAccounts()
      setAccounts(data)
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

  // Re-check state when the tab regains focus — covers a user returning from
  // a full-page OAuth redirect (Spotify) that navigated away and back.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return { accounts, loading, error, refresh }
}
