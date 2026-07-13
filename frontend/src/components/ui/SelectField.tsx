import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

import { FIELD_INPUT_CLASSES } from './fieldStyles'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  help?: ReactNode
  error?: string
  options: Array<{ value: string; label: string }>
}

export function SelectField({ label, help, error, options, className, id, ...rest }: SelectFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const helpId = help ? `${fieldId}-help` : undefined
  const errorId = error ? `${fieldId}-error` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <select
        id={fieldId}
        className={cn(
          FIELD_INPUT_CLASSES,
          'bg-white dark:bg-slate-800',
          error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(helpId, errorId) || undefined}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {help && (
        <p id={helpId} className="text-xs text-slate-500 dark:text-slate-400">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
