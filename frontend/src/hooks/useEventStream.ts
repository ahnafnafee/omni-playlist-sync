import { useCallback, useEffect, useState } from 'react'

import type { SyncEvent } from '../types'

// Mirrors the backend EventBus's own ring-buffer size (events.py) — plenty
// of history for a session without the DOM list growing unbounded.
const MAX_EVENTS = 500
const PASS_STARTED_RE = /pass started/i

export interface EventCounters {
  added: number
  removed: number
  held: number
  missing: number
}

const ZERO_COUNTERS: EventCounters = { added: 0, removed: 0, held: 0, missing: 0 }

/** Subscribes to the /events SSE stream for the lifetime of the component.
 * `EventSource` retries dropped connections on its own; we just track
 * connected/disconnected for the UI indicator. */
export function useEventStream() {
  const [events, setEvents] = useState<SyncEvent[]>([])
  const [counters, setCounters] = useState<EventCounters>(ZERO_COUNTERS)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const source = new EventSource('/events')

    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (ev: MessageEvent<string>) => {
      let parsed: SyncEvent
      try {
        parsed = JSON.parse(ev.data) as SyncEvent
      } catch {
        return // malformed line (shouldn't happen) — skip rather than crash the feed
      }

      setEvents((prev) => {
        const next = prev.length >= MAX_EVENTS ? prev.slice(prev.length - MAX_EVENTS + 1) : prev.slice()
        next.push(parsed)
        return next
      })

      setCounters((prev) => {
        if (parsed.kind === 'section' && PASS_STARTED_RE.test(parsed.message)) {
          return ZERO_COUNTERS
        }
        switch (parsed.kind) {
          case 'add':
            return { ...prev, added: prev.added + 1 }
          case 'remove':
            return { ...prev, removed: prev.removed + 1 }
          case 'hold':
            return { ...prev, held: prev.held + 1 }
          case 'miss':
            return { ...prev, missing: prev.missing + 1 }
          default:
            return prev
        }
      })
    }

    return () => source.close()
  }, [])

  const clear = useCallback(() => {
    setEvents([])
    setCounters(ZERO_COUNTERS)
  }, [])

  return { events, counters, connected, clear }
}
