import { type ReactNode, useId } from 'react'

import { Icon } from '@/components/icon'

export function FormSection({
  children,
  subtitle,
  title,
}: {
  children: ReactNode
  subtitle?: ReactNode
  title?: ReactNode
}) {
  return (
    <div className='form-section'>
      {(title || subtitle) && (
        <div>
          {title && <div className='form-section-title'>{title}</div>}
          {subtitle && <div className='form-section-sub'>{subtitle}</div>}
        </div>
      )}
      <div className='flex flex-col gap-4'>{children}</div>
    </div>
  )
}

export function RequiredMark() {
  return (
    <span aria-label='required' className='required-mark' title='Required'>
      *
    </span>
  )
}

/**
 * Wraps a single form input with a label, optional help, and optional error.
 * Renders the child with id/aria-describedby/aria-invalid wired up via a
 * `render` prop so consumers keep control over input JSX.
 */
export function FormField({
  children,
  error,
  help,
  label,
  required,
}: {
  children: (fieldProps: {
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
    id: string
  }) => ReactNode
  error?: ReactNode
  help?: ReactNode
  label: ReactNode
  required?: boolean
}) {
  const id = useId()
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className='form-field'>
      <label className='form-label' htmlFor={id}>
        <span>{label}</span>
        {required && <RequiredMark />}
      </label>
      {children({ 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, id })}
      {help && !error && (
        <span className='form-help' id={helpId}>
          {help}
        </span>
      )}
      {error && (
        <span className='form-error' id={errorId}>
          <Icon aria-hidden name='alert-triangle' size={11} />
          {error}
        </span>
      )}
    </div>
  )
}
