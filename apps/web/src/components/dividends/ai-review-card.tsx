'use client'

import { useState, useTransition } from 'react'

import { Icon } from '@/components/icon'
import { type DividendAiReview, runAiReview } from '@/lib/dividends/api'

/**
 * Visually distinct "AI review" card on the dividend declaration detail
 * page. Renders the structured output from the server (summary + risks
 * + warnings + missing info + suggested actions + shareholder-friendly
 * explanation) and provides a button to trigger a fresh review.
 *
 * Design intent:
 *   • The card has a brand-tinted top border so it's never confused
 *     with official workflow status panels.
 *   • Every panel header carries the "Assistant-generated" pill so a
 *     reviewer skimming the page knows which content is AI vs. system.
 *   • The footer disclaimer reinforces that workflow actions still
 *     require explicit operator clicks.
 */
export function AiReviewCard({
  dividendId,
  initialReview,
  initialHistory,
}: {
  dividendId: string
  initialReview?: DividendAiReview | null
  initialHistory?: DividendAiReview[]
}) {
  const [review, setReview] = useState<DividendAiReview | null>(initialReview ?? initialHistory?.[0] ?? null)
  const [history, setHistory] = useState<DividendAiReview[]>(initialHistory ?? [])
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<null | string>(null)

  const onRun = (): void => {
    setErrorMessage(null)
    startTransition(async () => {
      const next = await runAiReview(dividendId)
      if (next) {
        setReview(next)
        setHistory(prev => [next, ...prev])
      } else {
        setErrorMessage('AI review is unavailable right now — try again, or contact platform support.')
      }
    })
  }

  return (
    <section className='ai-review-card panel relative overflow-hidden border-t-2 border-t-brand-500'>
      <header className='flex items-center justify-between gap-3 border-b border-line px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Icon name='sparkles' size={16} />
          <div>
            <div className='text-[14px] font-semibold text-ink-900'>AI dividend review</div>
            <div className='text-[12px] text-ink-500'>
              Pre-flight checks, risks, and plain-English summary — assistant-generated, not a workflow action.
            </div>
          </div>
        </div>
        <button aria-busy={isPending} className='btn btn-brand btn-sm' disabled={isPending} onClick={onRun} type='button'>
          <Icon name={isPending ? 'loader' : 'play'} size={12} />
          {isPending ? 'Reviewing…' : review ? 'Re-run review' : 'Run AI review'}
        </button>
      </header>

      {errorMessage && <div className='border-b border-line bg-warning-50 px-4 py-2 text-[12px] text-warning-700'>{errorMessage}</div>}

      {!review ? (
        <div className='p-6 text-[13px] text-ink-600'>
          No review yet. Click <strong>Run AI review</strong> to get a plain-English summary of risks, warnings, missing information, and
          suggested next actions for this declaration.
        </div>
      ) : (
        <div className='flex flex-col gap-4 p-4'>
          <ReviewMeta review={review} />

          <div>
            <SectionLabel icon='message-square' label='Summary' />
            <p className='mt-1 text-[13px] leading-relaxed text-ink-800'>{review.output.summary}</p>
          </div>

          {review.output.risks.length > 0 && <ReviewList icon='alert-triangle' items={review.output.risks} label='Risks' tone='danger' />}
          {review.output.warnings.length > 0 && (
            <ReviewList icon='alert-circle' items={review.output.warnings} label='Warnings' tone='warn' />
          )}
          {review.output.missingInfo.length > 0 && (
            <ReviewList icon='inbox' items={review.output.missingInfo} label='Missing information' tone='info' />
          )}
          {review.output.suggestedActions.length > 0 && (
            <ReviewList icon='check-circle' items={review.output.suggestedActions} label='Suggested next actions' tone='ok' />
          )}

          <div>
            <SectionLabel icon='users' label='How to explain this to a shareholder' />
            <p className='mt-1 rounded-md bg-bg-50 p-3 text-[13px] leading-relaxed text-ink-700'>
              {review.output.shareholderFriendlyExplanation}
            </p>
          </div>

          <footer className='mt-1 flex items-center justify-between border-t border-line pt-3 text-[11px] text-ink-500'>
            <span>AI suggestions only. Workflow actions (approve, schedule, mark paid) still require explicit operator approval.</span>
            {history.length > 1 && <span>{history.length} reviews on file</span>}
          </footer>
        </div>
      )}
    </section>
  )
}

function ReviewMeta({ review }: { review: DividendAiReview }) {
  const generated = new Date(review.generatedAt)
  const generatedLabel = isNaN(generated.valueOf())
    ? review.generatedAt
    : generated.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const confidence = Math.round(review.output.confidence * 100)
  return (
    <div className='flex flex-wrap items-center gap-2 text-[11px] text-ink-500'>
      <span className='inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700'>
        <Icon name='sparkles' size={10} />
        Assistant-generated
      </span>
      <span>· generated {generatedLabel}</span>
      <span>·</span>
      <span>
        provider <strong className='text-ink-700'>{review.provider}</strong>
        {review.model ? ` (${review.model})` : ''}
      </span>
      <span>·</span>
      <span>
        confidence <strong className='text-ink-700'>{confidence}%</strong>
      </span>
      {review.providerError && (
        <span className='ml-auto inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-warning-700'>
          <Icon name='alert-circle' size={10} />
          fell back to deterministic
        </span>
      )}
      {review.preflight.blocking && (
        <span className='ml-auto inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-danger-700'>
          <Icon name='alert-triangle' size={10} />
          blocking issues
        </span>
      )}
    </div>
  )
}

function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <div className='flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-500'>
      <Icon name={icon} size={12} />
      {label}
    </div>
  )
}

function ReviewList({
  icon,
  items,
  label,
  tone,
}: {
  icon: string
  items: string[]
  label: string
  tone: 'danger' | 'info' | 'ok' | 'warn'
}) {
  const toneClass = {
    danger: 'text-danger-700 bg-danger-50',
    info: 'text-ink-700 bg-bg-50',
    ok: 'text-positive-700 bg-positive-50',
    warn: 'text-warning-700 bg-warning-50',
  }[tone]
  return (
    <div>
      <SectionLabel icon={icon} label={label} />
      <ul className='mt-1 flex flex-col gap-1'>
        {items.map((item, idx) => (
          <li className={`rounded-md px-3 py-2 text-[13px] leading-snug ${toneClass}`} key={idx}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
