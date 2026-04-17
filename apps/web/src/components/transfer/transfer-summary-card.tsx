import { Avatar, Badge, Panel } from '@/components/ui'
import { DESTINATION_LABEL, TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import type { TransferRequest } from '@/lib/transfer/types'

function fmtMoney(n?: number) {
  if (typeof n !== 'number') return '—'
  return n.toLocaleString('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  })
}

function fmtShares(n: number) {
  return n.toLocaleString('en-US')
}

export function TransferSummaryCard({ showAssignee = true, transfer }: { showAssignee?: boolean; transfer: TransferRequest }) {
  const { destination, holder, holding, shareCount } = transfer

  return (
    <Panel subtitle='Canonical transfer record' title='Transfer summary'>
      <dl className='dl'>
        <dt>Type</dt>
        <dd>{TRANSFER_TYPE_LABEL[transfer.transferType]}</dd>

        <dt>Shares</dt>
        <dd className='num'>
          {transfer.partial ? 'Partial · ' : 'Full position · '}
          {fmtShares(shareCount)} {holding.ticker} ≈ {fmtMoney(transfer.shareValue)}
        </dd>

        <dt>From registration</dt>
        <dd>
          <div className='flex items-center gap-2'>
            <Avatar name={holder.name} size={22} tone='ink' />
            <span>
              {holder.name} · {holding.type} · {holder.accountNumber}
            </span>
          </div>
          {holding.restrictionNote && (
            <div className='mt-0.5'>
              <Badge icon='alert-triangle' tone='warning'>
                {holding.restrictionNote}
              </Badge>
            </div>
          )}
        </dd>

        <dt>To destination</dt>
        <dd>
          <div className='text-[13px] font-medium text-ink-900'>
            {DESTINATION_LABEL[destination.kind]} · {destination.label}
          </div>
          {destination.brokerName && (
            <div className='text-[11.5px] text-ink-500'>
              {destination.brokerName}
              {destination.dtcParticipant && ` · DTC ${destination.dtcParticipant}`}
              {destination.accountNumber && ` · ${destination.accountNumber}`}
            </div>
          )}
          {destination.mailingAddress && <div className='text-[11.5px] text-ink-500'>{destination.mailingAddress}</div>}
          {destination.trusteeNames && destination.trusteeNames.length > 0 && (
            <div className='text-[11.5px] text-ink-500'>Trustees: {destination.trusteeNames.join(', ')}</div>
          )}
        </dd>

        <dt>Issuer</dt>
        <dd>
          {transfer.issuerName} · CUSIP {holding.cusip}
        </dd>

        {showAssignee && transfer.assignedReviewer && (
          <>
            <dt>Assigned reviewer</dt>
            <dd>
              <div className='flex items-center gap-2'>
                <Avatar name={transfer.assignedReviewer.name} size={22} tone='ink' />
                <span>{transfer.assignedReviewer.name}</span>
              </div>
            </dd>
          </>
        )}
      </dl>
    </Panel>
  )
}
