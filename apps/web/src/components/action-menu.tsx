'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/icon'

export type ActionMenuItem =
  | { kind: 'divider' }
  | { kind: 'label'; label: string }
  | {
      danger?: boolean
      disabled?: boolean
      icon?: string
      kind?: 'item'
      label: string
      onSelect?: () => void
    }

export function ActionMenu({
  align = 'end',
  buttonLabel = 'Actions',
  items,
  trigger,
}: {
  align?: 'end' | 'start'
  buttonLabel?: string
  items: ActionMenuItem[]
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className='action-menu' ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup='menu'
        aria-label={buttonLabel}
        className='btn btn-ghost btn-icon btn-sm'
        onClick={() => setOpen(v => !v)}
        type='button'
      >
        {trigger ?? <Icon name='more' size={14} />}
      </button>
      {open && (
        <div className='action-menu-panel' role='menu' style={align === 'start' ? { left: 0, right: 'auto' } : undefined}>
          {items.map((item, idx) => {
            if (item.kind === 'divider') return <div aria-hidden className='action-menu-divider' key={`d-${idx}`} />
            if (item.kind === 'label')
              return (
                <div className='action-menu-label' key={`l-${idx}`}>
                  {item.label}
                </div>
              )
            return (
              <button
                className={`action-menu-item ${item.danger ? 'danger' : ''}`}
                disabled={item.disabled}
                key={`${item.label}-${idx}`}
                onClick={() => {
                  if (!item.disabled) {
                    item.onSelect?.()
                    setOpen(false)
                  }
                }}
                role='menuitem'
                type='button'
              >
                {item.icon && <Icon aria-hidden name={item.icon} size={13} />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
