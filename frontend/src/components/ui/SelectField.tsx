import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

import { FIELD_INPUT_CLASSES } from './fieldStyles'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  help?: ReactNode
  options: Array<{ value: string; label: string }>
}

export function SelectField({ label, help, options, className, id, ...rest }: SelectFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const helpId = help ? `${fieldId}-help` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <select
        id={fieldId}
        className={cn(FIELD_INPUT_CLASSES, 'bg-white dark:bg-slate-800', className)}
        aria-describedby={helpId}
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
    </div>
  )
}
