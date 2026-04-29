import type { ReactNode } from 'react'

import { Icon } from '@/components/icon'
import { Badge, Panel } from '@/components/ui'

export type ValidationStatus = 'blocked' | 'passed' | 'review' | 'skipped'

export type ValidationCheck = {
  /** Optional short citation — e.g. "FINRA Rule 2150(c)" or "DTC DWAC format" */
  citation?: string
  description?: ReactNode
  /** Tells users what to do if the check isn't passed; shown inline for `review`/`blocked`. */
  howToFix?: ReactNode
  id: string
  label: string
  status: ValidationStatus
}

type Tone = 'danger' | 'info' | 'positive' | 'warning'

const STATUS_META: Record<ValidationStatus, { icon: string; label: string; tone: Tone }> = {
  blocked: { icon: 'alert-triangle', label: 'Blocked', tone: 'danger' },
  passed: { icon: 'check-circle', label: 'Passed', tone: 'positive' },
  review: { icon: 'alert-triangle', label: 'Needs review', tone: 'warning' },
  skipped: { icon: 'circle-dashed', label: 'Not applicable', tone: 'info' },
}

/**
 * Groups checks into Blockers / Needs review / Passed sections so humans can
 * triage compliance outcomes at a glance before anything posts to ledger.
 */
export function ValidationResultPanel({
  actions,
  checks,
  loading = false,
  subtitle,
  title = 'Validation & compliance',
}: {
  actions?: ReactNode
  checks: ValidationCheck[]
  loading?: boolean
  subtitle?: string
  title?: string
}) {
  const blocked = checks.filter(c => c.status === 'blocked')
  const review = checks.filter(c => c.status === 'review')
  const passed = checks.filter(c => c.status === 'passed')
  const skipped = checks.filter(c => c.status === 'skipped')

  const summaryTone: Tone = blocked.length ? 'danger' : review.length ? 'warning' : 'positive'
  const summaryLabel = blocked.length
    ? `${blocked.length} blocker${blocked.length === 1 ? '' : 's'}`
    : review.length
      ? `${review.length} item${review.length === 1 ? '' : 's'} need review`
      : 'All checks passed'

  const effectiveSubtitle =
    subtitle ??
    (loading
      ? 'Running checks against regulatory rules and ledger data…'
      : 'Automated checks against regulatory rules, medallion, KYC/OFAC, and ledger availability.')

  return (
    <Panel actions={actions} subtitle={effectiveSubtitle} title={title}>
      <div className='validation-header'>
        <Badge
          icon={loading ? 'refresh' : STATUS_META[blocked.length ? 'blocked' : review.length ? 'review' : 'passed'].icon}
          tone={summaryTone}
        >
          {loading ? 'Running…' : summaryLabel}
        </Badge>
        <div className='validation-header-counts'>
          <span className='validation-count'>
            <span className='dot dot-danger' /> {blocked.length} blocked
          </span>
          <span className='validation-count'>
            <span className='dot dot-warning' /> {review.length} review
          </span>
          <span className='validation-count'>
            <span className='dot dot-positive' /> {passed.length} passed
          </span>
          {skipped.length > 0 && (
            <span className='validation-count'>
              <span className='dot' /> {skipped.length} n/a
            </span>
          )}
        </div>
      </div>

      {blocked.length > 0 && <ChecksGroup checks={blocked} title='Blockers — must fix before posting' tone='danger' />}
      {review.length > 0 && <ChecksGroup checks={review} title='Needs review' tone='warning' />}
      {passed.length > 0 && <ChecksGroup checks={passed} collapsible title={`Passed (${passed.length})`} tone='positive' />}
      {skipped.length > 0 && <ChecksGroup checks={skipped} collapsible title={`Not applicable (${skipped.length})`} tone='info' />}
    </Panel>
  )
}

function ChecksGroup({
  checks,
  collapsible = false,
  title,
  tone,
}: {
  checks: ValidationCheck[]
  collapsible?: boolean
  title: string
  tone: Tone
}) {
  const content = (
    <ul className='validation-list'>
      {checks.map(c => (
        <li className={`validation-item validation-${c.status}`} key={c.id}>
          <span aria-hidden className={`validation-marker validation-marker-${tone}`}>
            <Icon name={STATUS_META[c.status].icon} size={12} />
          </span>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
              <span className='text-[13px] font-semibold text-ink-900'>{c.label}</span>
              <span className='sr-only'>Status: {STATUS_META[c.status].label}.</span>
              {c.citation && <span className='mono text-[10.5px] uppercase tracking-[0.06em] text-ink-500'>{c.citation}</span>}
            </div>
            {c.description && <div className='mt-0.5 text-[12.5px] text-ink-600'>{c.description}</div>}
            {c.howToFix && (c.status === 'blocked' || c.status === 'review') && (
              <div className='mt-1 text-[12px] text-ink-600'>
                <span className='font-semibold text-ink-700'>How to fix: </span>
                {c.howToFix}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )

  if (collapsible) {
    return (
      <details className='validation-group'>
        <summary className='validation-group-title'>
          <Icon aria-hidden name='chevron-right' size={12} />
          <span>{title}</span>
        </summary>
        <div className='mt-2'>{content}</div>
      </details>
    )
  }

  return (
    <div className='validation-group'>
      <div className='validation-group-title validation-group-title-static'>{title}</div>
      <div className='mt-1.5'>{content}</div>
    </div>
  )
}
