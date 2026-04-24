import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'

export type NextStep = {
  description?: ReactNode
  icon?: string
  title: string
}

/**
 * Shared post-submit confirmation screen.
 * Communicates the case has been submitted, what happens next, and surfaces
 * primary/secondary CTAs (e.g. "View status tracker", "Back to all transfers").
 */
export function TransferConfirmationScreen({
  actions,
  caseId,
  message,
  nextSteps = [],
  title = 'Transfer submitted',
  turnaround,
}: {
  actions?: ReactNode
  caseId: string
  message?: ReactNode
  nextSteps?: NextStep[]
  title?: string
  turnaround?: string
}) {
  return (
    <div className='confirmation-screen' role='status'>
      <div aria-hidden className='confirmation-icon'>
        <Icon name='check-circle' size={28} />
      </div>
      <div className='confirmation-title'>{title}</div>
      <div className='confirmation-case-id mono'>{caseId}</div>
      {message && <p className='confirmation-message'>{message}</p>}
      {turnaround && (
        <div className='confirmation-turnaround'>
          <Icon aria-hidden name='clock' size={12} />
          <span>
            Typical turnaround: <strong>{turnaround}</strong>
          </span>
        </div>
      )}

      {nextSteps.length > 0 && (
        <section className='confirmation-next-steps' aria-label='What happens next'>
          <h3 className='confirmation-next-title'>What happens next</h3>
          <ol className='confirmation-step-list'>
            {nextSteps.map((step, idx) => (
              <li className='confirmation-step' key={step.title}>
                <span aria-hidden className='confirmation-step-num'>
                  {step.icon ? <Icon name={step.icon} size={12} /> : idx + 1}
                </span>
                <div>
                  <div className='confirmation-step-title'>{step.title}</div>
                  {step.description && <div className='confirmation-step-desc'>{step.description}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {actions && <div className='confirmation-actions'>{actions}</div>}
    </div>
  )
}
