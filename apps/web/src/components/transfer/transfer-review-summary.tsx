import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { Badge, Panel } from '@/components/ui'

export type ReviewField = {
  hint?: ReactNode
  label: string
  value: ReactNode
}

export type ReviewSection = {
  fields: ReviewField[]
  icon?: string
  /** Called when the user wants to jump back to this step to edit. */
  onEdit?: () => void
  title: string
}

/**
 * Standardized review summary shown before an irreversible action.
 * Groups fields by section (source, recipient, details, documents, approvals, etc.)
 * and provides "Edit" affordances so a user can jump back to correct a field.
 */
export function TransferReviewSummary({
  auditNote,
  ledgerImpact,
  sections,
  subtitle = 'Verify every field — this will be submitted to the transfer agent for review and posting.',
  title = 'Review transfer',
  validationSummary,
}: {
  /** Short audit/immutability note shown at the bottom. */
  auditNote?: ReactNode
  /** Optional ledger impact panel rendered inside the summary. */
  ledgerImpact?: ReactNode
  sections: ReviewSection[]
  subtitle?: string
  title?: string
  /** Optional slot for a validation summary pill / badge strip. */
  validationSummary?: ReactNode
}) {
  return (
    <Panel subtitle={subtitle} title={title}>
      {validationSummary && <div className='mb-4'>{validationSummary}</div>}

      <div className='flex flex-col gap-4'>
        {sections.map(section => (
          <section aria-labelledby={`review-${slug(section.title)}`} className='review-section' key={section.title}>
            <header className='review-section-header'>
              <div className='flex items-center gap-2'>
                {section.icon && (
                  <span aria-hidden className='review-section-icon'>
                    <Icon name={section.icon} size={13} />
                  </span>
                )}
                <h3 className='review-section-title' id={`review-${slug(section.title)}`}>
                  {section.title}
                </h3>
              </div>
              {section.onEdit && (
                <button aria-label={`Edit ${section.title}`} className='btn btn-ghost btn-sm' onClick={section.onEdit} type='button'>
                  <Icon aria-hidden name='pencil' size={12} />
                  Edit
                </button>
              )}
            </header>
            <dl className='review-grid'>
              {section.fields.map(field => (
                <div className='review-row' key={field.label}>
                  <dt className='review-label'>{field.label}</dt>
                  <dd className='review-value'>
                    {field.value || <span className='text-ink-400'>—</span>}
                    {field.hint && <div className='review-hint'>{field.hint}</div>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        {ledgerImpact}

        {auditNote && (
          <div className='flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-ink-600'>
            <Icon aria-hidden className='mt-0.5 text-ink-500' name='shield-check' size={13} />
            <div>{auditNote}</div>
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * Lightweight helper to render a validation status chip strip inside
 * `TransferReviewSummary`'s `validationSummary` slot.
 */
export function ReviewValidationSummary({ blocked, passed, review }: { blocked: number; passed: number; review: number }) {
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge
        icon={blocked ? 'alert-triangle' : review ? 'alert-triangle' : 'check-circle'}
        tone={blocked ? 'danger' : review ? 'warning' : 'positive'}
      >
        {blocked ? `${blocked} blocker${blocked === 1 ? '' : 's'}` : review ? `${review} to review` : 'Ready to submit'}
      </Badge>
      {passed > 0 && <Badge tone='positive'>{passed} passed</Badge>}
    </div>
  )
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
