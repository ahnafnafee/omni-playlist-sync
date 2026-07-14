import { EventFeedList } from '@/components/events/EventFeedList'
import { useEventStream } from '@/hooks/useEventStream'
import { cn } from '@/lib/cn'

import { CountChip, type CountChipTone } from '../ui/CountChip'

const COUNTER_META: Array<{ key: 'added' | 'removed' | 'held' | 'missing'; sign: string; tone: CountChipTone }> = [
  { key: 'added', sign: '+', tone: 'success' },
  { key: 'removed', sign: '−', tone: 'danger' },
  { key: 'held', sign: '~', tone: 'warning' },
  { key: 'missing', sign: '×', tone: 'neutral' },
]

/** Live-tails the /events SSE stream for the sync dashboard, with running
 * add/remove/held/missing counters for the current pass. */
export function LiveFeed() {
  const { events, counters, connected } = useEventStream()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-neutral')}
            aria-hidden="true"
          />
          <span className="font-mono text-[10.5px] font-semibold tracking-wide text-text-3">LIVE FEED</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10.5px] tracking-wide text-text-3">THIS PASS</span>
          {COUNTER_META.map((c) => (
            <CountChip key={c.key} tone={c.tone} sign={c.sign} value={counters[c.key]} />
          ))}
        </div>
      </div>

      <EventFeedList
        events={events}
        emptyTitle="No activity yet"
        emptyDescription="Start a sync to see live progress here. Every track added, removed, or held will show up in real time."
        ariaLabel="Live sync activity"
      />
    </div>
  )
}
