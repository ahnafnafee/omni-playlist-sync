import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { FIELD_INPUT_CLASSES } from './fieldStyles'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  help?: ReactNode
  error?: string
}

export function TextField({ label, help, error, className, id, required, ...rest }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const helpId = help ? `${fieldId}-help` : undefined
  const errorId = error ? `${fieldId}-error` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        {required && (
          <>
            {' '}
            <span className="text-rose-500" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      <input
        id={fieldId}
        required={required}
        className={cn(FIELD_INPUT_CLASSES, error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/30', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(helpId, errorId) || undefined}
        {...rest}
      />
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
