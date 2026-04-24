import { Icon } from '@/components/icon'

export type StepperStep<Id extends string = string> = {
  id: Id
  label: string
  sub?: string
}

/**
 * Horizontal numbered stepper for multi-step workflows.
 * - Current step is visually emphasized.
 * - Completed steps can be clicked to jump back (when `onStepClick` is provided).
 * - `aria-current='step'` on the active item; previous/future buttons have explicit labels.
 */
export function TransferStepper<Id extends string>({
  activeStepId,
  onStepClick,
  steps,
}: {
  activeStepId: Id
  onStepClick?: (id: Id) => void
  steps: Array<StepperStep<Id>>
}) {
  const activeIdx = Math.max(
    0,
    steps.findIndex(s => s.id === activeStepId),
  )

  return (
    <nav aria-label='Workflow steps' className='wizard-steps'>
      <ol className='wizard-steps-list' role='list'>
        {steps.map((s, idx) => {
          const done = idx < activeIdx
          const current = idx === activeIdx
          const state = done ? 'done' : current ? 'current' : ''
          const canJump = done && typeof onStepClick === 'function'
          const content = (
            <>
              <span aria-hidden className='wizard-step-num'>
                {done ? <Icon name='check' size={12} /> : idx + 1}
              </span>
              <span className='flex min-w-0 flex-col'>
                <span className='wizard-step-title'>{s.label}</span>
                {s.sub && <span className='wizard-step-sub'>{s.sub}</span>}
              </span>
            </>
          )
          return (
            <li className={`wizard-step ${state}`} key={s.id}>
              {canJump ? (
                <button
                  aria-label={`Go back to step ${idx + 1}: ${s.label}`}
                  className='wizard-step-button'
                  onClick={() => onStepClick!(s.id)}
                  type='button'
                >
                  {content}
                </button>
              ) : (
                <span
                  aria-current={current ? 'step' : undefined}
                  className='wizard-step-inner'
                >
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
