import { Panel } from '@/components/ui'

export default function InvestorDividendsLoading() {
  return (
    <div className='page-body space-y-3'>
      <Panel padded title='Loading your dividends'>
        <div className='animate-pulse space-y-3'>
          <div className='h-3 w-1/3 rounded bg-ink-100' />
          <div className='h-3 w-1/2 rounded bg-ink-100' />
          <div className='h-3 w-2/3 rounded bg-ink-100' />
        </div>
      </Panel>
    </div>
  )
}
