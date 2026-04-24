'use client'

import { type ReactNode, useEffect, useId } from 'react'

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  children,
  confirmLabel = 'Confirm',
  destructive,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel?: string
  children?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}) {
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className='dialog-backdrop' onClick={onCancel} role='presentation'>
      <div
        aria-describedby={children ? descId : undefined}
        aria-labelledby={titleId}
        aria-modal='true'
        className='dialog-panel'
        onClick={e => e.stopPropagation()}
        role='dialog'
      >
        <div className='dialog-header'>
          <h2 className='dialog-title' id={titleId}>
            {title}
          </h2>
        </div>
        {children && (
          <div className='dialog-body' id={descId}>
            {children}
          </div>
        )}
        <div className='dialog-footer'>
          <button autoFocus className='btn btn-secondary btn-sm' onClick={onCancel} type='button'>
            {cancelLabel}
          </button>
          <button className={`btn btn-sm ${destructive ? 'btn-danger' : 'btn-brand'}`} onClick={onConfirm} type='button'>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
