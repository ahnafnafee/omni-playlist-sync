import { cn } from '@/lib/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

/** An accessible switch. The whole row — label, description, and track — is
 * one `role="switch"` button, so the tap target is the full row width and a
 * comfortable >=44px tall rather than just the small visual track. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-4 rounded-lg text-left transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}
