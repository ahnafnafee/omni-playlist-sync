import { ACCOUNT_STATE_STYLES } from '@/lib/constants'
import { cn } from '@/lib/cn'
import type { AccountState } from '@/types'

export function StatusPill({ state, className }: { state: AccountState; className?: string }) {
  const style = ACCOUNT_STATE_STYLES[state]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        style.badge,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  )
}
