'use client'

import { useEffect } from 'react'

import { ErrorState } from '@/components/ui'

/**
 * Section-level error boundary for the issuer dividends UI. Catches
 * thrown errors from any nested route segment so the app shell stays
 * mounted instead of crashing back to the global Next.js boundary.
 *
 * The boundary is intentionally generic — it surfaces the error
 * message but never the stack, and offers a single "Try again"
 * action that re-runs the failed render. Auth/forbidden errors
 * (e.g. when an issuer admin lands on a route they can't access)
 * funnel into the same UI with the message replaced by a friendlier
 * description so we don't leak issuer ids or row counts.
 */
export default function IssuerDividendsErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console -- intentional client-side log for ops triage.
      console.error('[issuer/dividends] route error', error)
    }
  }, [error])

  const message = error.message || 'Something went wrong while loading this page.'
  const isUnauthorized = /forbidden|denied|unauthor/i.test(message)
  const title = isUnauthorized ? 'You do not have access to this view' : 'We hit a problem loading dividends'
  const description = isUnauthorized
    ? 'This dividend belongs to an issuer outside your scope. Reach out to your administrator if you think this is wrong.'
    : 'The data fetch failed. Try again — if the issue persists, copy the error code and ping support.'

  return (
    <div className='page-body'>
      <ErrorState
        action={
          !isUnauthorized && (
            <button className='btn btn-secondary btn-sm' onClick={() => reset()} type='button'>
              Try again
            </button>
          )
        }
        icon={isUnauthorized ? 'lock' : 'alert-triangle'}
        title={title}
      >
        <span>{description}</span>
        {error.digest && <code className='ml-1 text-[11px] text-ink-400'>(ref {error.digest})</code>}
      </ErrorState>
    </div>
  )
}
