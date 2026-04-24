'use client'

import { type ReactNode, useEffect, useId } from 'react'

import { Icon } from '@/components/icon'

export function DetailDrawer({
  children,
  eyebrow,
  footer,
  onClose,
  open,
  subtitle,
  title,
}: {
  children?: ReactNode
  eyebrow?: ReactNode
  footer?: ReactNode
  onClose: () => void
  open: boolean
  subtitle?: ReactNode
  title: ReactNode
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className='drawer-backdrop' onClick={onClose} role='presentation' />
      <aside aria-labelledby={titleId} aria-modal='true' className='drawer-panel' role='dialog'>
        <header className='drawer-header'>
          <div className='min-w-0'>
            {eyebrow && <div className='page-eyebrow'>{eyebrow}</div>}
            <h2 className='text-[18px] font-semibold tracking-[-0.015em] text-ink-900' id={titleId}>
              {title}
            </h2>
            {subtitle && <div className='mt-1 text-[12.5px] text-ink-500'>{subtitle}</div>}
          </div>
          <button aria-label='Close panel' className='btn btn-ghost btn-icon btn-sm' onClick={onClose} type='button'>
            <Icon name='x' size={14} />
          </button>
        </header>
        <div className='drawer-body'>{children}</div>
        {footer && <footer className='drawer-footer'>{footer}</footer>}
      </aside>
    </>
  )
}
