import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'

export type StepState = 'current' | 'done' | 'upcoming'

export function StepProgress({
  steps,
}: {
  steps: Array<{
    label: string
    state: StepState
    value?: string
  }>
}) {
  return (
    <div className='step-progress'>
      {steps.map((s) => (
        <div
          className={`step-progress-item ${s.state === 'done' ? 'done' : ''} ${
            s.state === 'current' ? 'current' : ''
          }`}
          key={s.label}
        >
          <div className='step-progress-label'>{s.label}</div>
          {s.value && (
            <div className='step-progress-value'>{s.value}</div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ConfidenceInterval({
  high,
  low,
}: {
  high: number
  low: number
}) {
  const level: 'high' | 'low' | 'med' =
    low >= 85 ? 'high' : low >= 65 ? 'med' : 'low'
  return (
    <span className='confidence-interval'>
      <span className='interval-bar'>
        <span
          className={`interval-range ${level}`}
          style={{
            left: `${low}%`,
            width: `${Math.max(3, high - low)}%`,
          }}
        />
      </span>
      <span className='num text-[12px] font-medium text-[color:var(--color-ink-800)]'>
        {low}–{high}%
      </span>
    </span>
  )
}

export function ActionBar({
  actions,
  count,
  label,
  onClear,
}: {
  actions: ReactNode
  count: number
  label?: string
  onClear?: () => void
}) {
  return (
    <div className='action-bar'>
      <div className='flex items-center gap-3'>
        <span className='flex h-6 items-center justify-center rounded-full bg-white/12 px-2 text-[12px] font-semibold'>
          {count} selected
        </span>
        {label && (
          <span className='text-[12.5px] text-white/75'>{label}</span>
        )}
      </div>
      <div className='flex items-center gap-1.5'>
        {actions}
        {onClear && (
          <button className='btn btn-ghost btn-sm' onClick={onClear} type='button'>
            <Icon name='x' size={13} />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export function RiskItem({
  body,
  severity = 'med',
  title,
}: {
  body: ReactNode
  severity?: 'high' | 'low' | 'med'
  title: string
}) {
  const iconByLevel = {
    high: { color: 'var(--color-danger-700)', icon: 'alert-triangle' },
    low: { color: 'var(--color-ink-500)', icon: 'info' },
    med: { color: 'var(--color-warning-700)', icon: 'alert-triangle' },
  } as const
  const meta = iconByLevel[severity]
  return (
    <div className={`risk-item ${severity}`}>
      <div style={{ color: meta.color }}>
        <Icon name={meta.icon} size={15} />
      </div>
      <div>
        <div className='risk-title'>{title}</div>
        <div className='risk-body'>{body}</div>
      </div>
      <button className='btn btn-ghost btn-sm' type='button'>
        <Icon name='eye' size={12} />
      </button>
    </div>
  )
}
