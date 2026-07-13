import { useEffect, useRef, useState } from 'react'

import { useEventStream } from '@/hooks/useEventStream'
import { cn } from '@/lib/cn'

import { EmptyState } from '../ui/EmptyState'
import { EventRow } from './EventRow'

const COUNTER_META: Array<{ key: 'added' | 'removed' | 'held' | 'missing'; label: string; sign: string; className: string }> = [
  { key: 'added', label: 'added', sign: '+', className: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'removed', label: 'removed', sign: '-', className: 'text-rose-600 dark:text-rose-400' },
  { key: 'held', label: 'held', sign: '', className: 'text-amber-600 dark:text-amber-400' },
  { key: 'missing', label: 'missing', sign: '', className: 'text-slate-500 dark:text-slate-400' },
]

/** Live-tails the /events SSE stream. Auto-scrolls to the newest line, but
 * pauses while the user is hovering or has focused the list (mouse AND
 * keyboard parity) so they can read without the feed yanking away. */
export function LiveFeed() {
  const { events, counters, connected } = useEventStream()
  const [paused, setPaused] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (paused) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [events, paused])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Live activity</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {connected ? 'connected' : 'reconnecting…'}
          </span>
          {paused && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Paused
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          {COUNTER_META.map((c) => (
            <span key={c.key}>
              <span className={c.className}>
                {c.sign}
                {counters[c.key]}
              </span>{' '}
              <span className="text-slate-400 dark:text-slate-500">{c.label}</span>
            </span>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Start a sync to see live progress here — every track added, removed, or held will show up in real time."
        />
      ) : (
        <ul
          ref={listRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          tabIndex={0}
          role="log"
          aria-label="Live sync activity"
          className="thin-scrollbar flex max-h-80 flex-col gap-0.5 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50/60 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-slate-800 dark:bg-slate-950/40 sm:max-h-[28rem]"
        >
          {events.map((event, i) => (
            // Events carry no stable id from the backend; index is fine since
            // this list only ever appends/truncates from the head, never reorders.
            <EventRow key={i} event={event} />
          ))}
        </ul>
      )}
    </div>
  )
}
