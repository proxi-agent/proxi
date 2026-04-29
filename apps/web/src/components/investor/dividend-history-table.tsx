import Link from 'next/link'

import { EntitlementStatusBadge } from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import { DIVIDEND_TYPE_LABEL, formatCents, formatDate, formatShares } from '@/lib/dividends/copy'
import type { ShareholderDividend } from '@/lib/dividends/shareholder'

/** Dividend history table — read-only, friendly column headings, links to detail. */
export function DividendHistoryTable({ rows }: { rows: ShareholderDividend[] }) {
  return (
    <div className='table-wrap'>
      <table className='table'>
        <thead>
          <tr>
            <th>Company</th>
            <th>Type</th>
            <th>Record date</th>
            <th>Pay date</th>
            <th className='cell-num'>Shares</th>
            <th className='cell-num'>Gross</th>
            <th className='cell-num'>Withholding</th>
            <th className='cell-num'>Net</th>
            <th>Status</th>
            <th aria-label='Statement' />
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr className='table-row-clickable' key={d.id}>
              <td>
                <Link className='cell-primary' href={`/investor/dividends/${d.id}`}>
                  {d.issuerName}
                  {d.issuerTicker ? <span className='ml-1 text-ink-500'>· {d.issuerTicker}</span> : null}
                </Link>
                <div className='cell-muted'>{d.securityLabel}</div>
              </td>
              <td>
                <Badge tone='neutral'>{DIVIDEND_TYPE_LABEL[d.dividendType]}</Badge>
              </td>
              <td className='cell-muted'>{formatDate(d.recordDate)}</td>
              <td className='cell-muted'>{formatDate(d.paymentDate)}</td>
              <td className='cell-num num'>{formatShares(d.sharesEligible)}</td>
              <td className='cell-num num'>{formatCents(d.grossCents, d.currency)}</td>
              <td className='cell-num num'>
                {d.withholdingCents === 0 ? (
                  <span className='text-ink-400'>—</span>
                ) : (
                  <span className='text-warning-700'>{formatCents(d.withholdingCents, d.currency)}</span>
                )}
              </td>
              <td className='cell-num num cell-primary'>{formatCents(d.netCents, d.currency)}</td>
              <td>
                <EntitlementStatusBadge status={d.paymentStatus} />
              </td>
              <td>
                <Link
                  aria-label={`View statement for ${d.issuerName} dividend`}
                  className='btn btn-ghost btn-sm'
                  href={`/investor/dividends/${d.id}/statement`}
                >
                  Statement
                  <Icon name='arrow-right' size={12} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
