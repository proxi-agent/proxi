import { Icon } from '@/components/icon'
import { StepProgress } from '@/components/primitives'
import { Badge } from '@/components/ui'
import { STEP_PRIMITIVE_STATE } from '@/lib/dividends/copy'
import type { WorkflowStep } from '@/lib/dividends/types'

/** Renders the canonical 11-step dividend workflow as a stepper. */
export function DividendWorkflowStepper({ steps }: { steps: WorkflowStep[] }) {
  const primitive = steps.map(s => ({
    label: s.label,
    state: STEP_PRIMITIVE_STATE[s.state],
    value: s.detail ?? '',
  }))
  return <StepProgress steps={primitive} />
}

const STEP_TONE: Record<string, 'brand' | 'danger' | 'info' | 'neutral' | 'positive' | 'warning'> = {
  BLOCKED: 'danger',
  DONE: 'positive',
  IN_PROGRESS: 'brand',
  PENDING: 'neutral',
  SKIPPED: 'neutral',
}

const STEP_ICON: Record<string, string> = {
  BLOCKED: 'lock',
  DONE: 'check-circle',
  IN_PROGRESS: 'circle-dot',
  PENDING: 'circle-dashed',
  SKIPPED: 'arrow-right',
}

/**
 * Vertical, evidence-rich stepper used inside the declaration detail page.
 *
 * Rendered as a presentational list rather than interactive buttons —
 * the page is wrapped in `<AppShell>` (a client component), so the
 * children get serialized across the server→client boundary and inline
 * `onClick` handlers from a server component would crash with
 * "Event handlers cannot be passed to Client Component props." The list
 * is read-only today; if step click navigation is reintroduced, lift
 * this component into its own `'use client'` file.
 */
export function DividendWorkflowList({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className='flex flex-col'>
      {steps.map((step, idx) => {
        const tone = STEP_TONE[step.state]
        const icon = STEP_ICON[step.state]
        const isLast = idx === steps.length - 1
        return (
          <li className='flex gap-3' key={step.key}>
            <div className='flex flex-col items-center'>
              <span
                aria-hidden
                className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                  step.state === 'DONE'
                    ? 'border-positive-100 bg-positive-50 text-positive-700'
                    : step.state === 'IN_PROGRESS'
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : step.state === 'BLOCKED'
                        ? 'border-danger-100 bg-danger-50 text-danger-700'
                        : 'border-line bg-surface text-ink-400'
                }`}
              >
                <Icon name={icon} size={13} />
              </span>
              {!isLast && <span aria-hidden className='my-1 w-px flex-1 bg-line' />}
            </div>
            <div className='-mx-2 mb-3 flex flex-1 flex-col rounded-md px-2 py-1.5 text-left'>
              <span className='flex items-center gap-2'>
                <span className='text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-500'>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className='text-[14px] font-semibold text-ink-900'>{step.label}</span>
                <Badge tone={tone}>{step.state.replace('_', ' ').toLowerCase()}</Badge>
              </span>
              {step.detail && <span className='mt-0.5 text-[12.5px] text-ink-600'>{step.detail}</span>}
              {step.warnings && step.warnings.length > 0 && (
                <span className='mt-1.5 flex flex-wrap gap-1.5'>
                  {step.warnings.map(w => (
                    <Badge icon='alert-triangle' key={w.code} tone={w.severity === 'ERROR' ? 'danger' : 'warning'}>
                      {w.detail ?? w.code}
                    </Badge>
                  ))}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
