import { cn } from '@/lib/cn'
import { KIND_STYLES, tagLabel, tagStyle } from '@/lib/constants'
import { formatClock } from '@/lib/format'
import type { SyncEvent } from '@/types'

export function EventRow({ event }: { event: SyncEvent }) {
  const style = KIND_STYLES[event.kind]

  if (event.kind === 'section') {
    return (
      <li className={cn('flex items-center gap-3 rounded-lg px-3 py-2', style.row)}>
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
        <span className={cn('shrink-0 text-xs uppercase tracking-wide', style.text)}>{event.message}</span>
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
      </li>
    )
  }

  return (
    <li className={cn('flex flex-wrap items-start gap-x-2.5 gap-y-1 rounded-lg px-3 py-1.5 text-sm', style.row)}>
      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
      <span className="w-16 shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500 sm:w-[4.5rem]">
        {formatClock(event.ts)}
      </span>
      <span className={cn('w-fit shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium', tagStyle(event.tag))}>
        {tagLabel(event.tag)}
      </span>
      {/* `basis-full` forces the message onto its own line below the
          dot/time/tag on narrow screens (rather than being squeezed into
          whatever sliver of the first line is left); from `sm` up there's
          enough room for it to sit inline instead. */}
      <span className={cn('min-w-0 basis-full break-words sm:flex-1 sm:basis-0', style.text)}>
        {event.message}
      </span>
    </li>
  )
}
