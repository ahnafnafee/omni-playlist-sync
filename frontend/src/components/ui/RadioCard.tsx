import { cn } from '@/lib/cn'

interface RadioCardProps {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  title: string
  description: string
  disabled?: boolean
}

export function RadioCard({ name, value, checked, onChange, title, description, disabled }: RadioCardProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors',
        checked
          ? 'border-brand-500 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-950/30'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="size-4 accent-brand-600"
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
    </label>
  )
}
