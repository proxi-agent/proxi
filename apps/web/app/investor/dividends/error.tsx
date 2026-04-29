'use client'

import { useEffect } from 'react'

import { ErrorState } from '@/components/ui'

/**
 * Shareholder-portal error boundary for dividend pages. Mirrors the
 * issuer boundary in tone but uses softer, non-jargon copy so a
 * shareholder hitting a transient failure doesn't see "tenant",
 * "scope", or other internal terminology.
 */
export default function InvestorDividendsErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console -- intentional client-side log for ops triage.
      console.error('[investor/dividends] route error', error)
    }
  }, [error])

  const message = error.message || 'Something went wrong while loading your dividends.'
  const isUnauthorized = /forbidden|denied|unauthor/i.test(message)
  const title = isUnauthorized ? 'This page is not available for your account' : 'We could not load your dividends right now'
  const description = isUnauthorized
    ? 'If you think this is wrong, contact the company that issued your shares.'
    : 'The page could not be loaded. Try again — if the problem keeps happening, contact support.'

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
      </ErrorState>
    </div>
  )
}
