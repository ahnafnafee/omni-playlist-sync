import { LuChevronDown } from 'react-icons/lu'

import { useStickToBottom } from '@/hooks/useStickToBottom'
import type { SyncEvent } from '@/types'

import { EmptyState } from '../ui/EmptyState'
import { EventRow } from './EventRow'

interface EventFeedListProps {
  events: SyncEvent[]
  emptyTitle: string
  emptyDescription: string
  ariaLabel: string
}

/** The scrollable, auto-following list of event rows shared by the
 * Dashboard's live feed and the Transfers page's live feed. Sticks to the
 * newest line while the user is at (or near) the bottom - the standard
 * chat-log pattern - but leaves their scroll position alone once they've
 * scrolled up to read older lines, surfacing a floating "jump to newest"
 * button instead of yanking them back down. */
export function EventFeedList({ events, emptyTitle, emptyDescription, ariaLabel }: EventFeedListProps) {
  const { containerRef, isAtBottom, newCount, scrollToBottom } = useStickToBottom<HTMLUListElement>(events.length)

  if (events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="relative">
      <ul
        ref={containerRef}
        tabIndex={0}
        role="log"
        aria-label={ariaLabel}
        className="thin-scrollbar flex max-h-80 flex-col gap-0.5 overflow-y-auto overflow-x-hidden rounded-card border border-border bg-inset p-1.5 focus:outline-none sm:max-h-[28rem]"
      >
        {events.map((event, i) => (
          // Events carry no stable id from the backend; index is fine since
          // this list only ever appends/truncates from the head, never reorders.
          <EventRow key={i} event={event} />
        ))}
      </ul>
      {!isAtBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label={newCount > 0 ? `Jump to newest, ${newCount} new` : 'Jump to newest'}
          className="absolute bottom-2.5 right-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent shadow-(--shadow-key) transition-colors duration-fast hover:bg-accent-hover active:bg-accent-active"
        >
          {newCount > 0 && <span className="tabular-nums">{newCount > 99 ? '99+' : newCount} new</span>}
          <LuChevronDown className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
