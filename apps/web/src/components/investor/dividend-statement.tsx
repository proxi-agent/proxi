import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui'
import { DIVIDEND_TYPE_LABEL, formatCents, formatDate, formatShares, RATE_TYPE_LABEL } from '@/lib/dividends/copy'
import type { ShareholderStatement } from '@/lib/dividends/shareholder'

/**
 * Printable statement layout. Designed to look clean both on screen and in print.
 * Use a wrapping page (or browser `Cmd+P`) to download/save as PDF.
 */
export function DividendStatement({ statement }: { statement: ShareholderStatement }) {
  const d = statement.dividend
  return (
    <article
      aria-label='Dividend statement'
      className='rounded-lg border border-line bg-surface p-6 shadow-sm print:border-0 print:p-0 print:shadow-none'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4'>
        <div>
          <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500'>
            <Icon name='coins' size={12} />
            Dividend statement
          </div>
          <h1 className='mt-1 text-[20px] font-semibold tracking-[-0.01em] text-ink-900'>{d.issuerName}</h1>
          <div className='text-[13px] text-ink-500'>
            {d.securityLabel}
            {d.securityClass ? ` · ${d.securityClass}` : ''}
          </div>
        </div>
        <div className='text-right text-[12px] text-ink-500'>
          <div className='mono'>{statement.statementId}</div>
          <div>Generated {formatDate(statement.generatedAt)}</div>
          <div className='mt-1'>
            <Badge tone='neutral'>{DIVIDEND_TYPE_LABEL[d.dividendType]}</Badge>
          </div>
        </div>
      </header>

      <section className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2'>
        <div>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Shareholder</div>
          <div className='mt-1 text-[14px] font-semibold text-ink-900'>{statement.shareholderName}</div>
          <div className='cell-muted'>Account {statement.account}</div>
        </div>
        <div>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Issuer</div>
          <div className='mt-1 text-[14px] font-semibold text-ink-900'>{d.issuerName}</div>
          <div className='cell-muted'>{d.securityLabel}</div>
        </div>
      </section>

      <section className='mt-5 grid grid-cols-2 gap-3 md:grid-cols-4'>
        <Field label='Record date' value={formatDate(d.recordDate)} />
        <Field label='Pay date' value={formatDate(d.paymentDate)} />
        <Field label='Rate' value={`${d.currency} ${d.rateAmount} ${RATE_TYPE_LABEL.PER_SHARE.toLowerCase()}`} />
        <Field label='Shares eligible' value={formatShares(d.sharesEligible)} />
      </section>

      <section className='mt-5'>
        <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Amounts</div>
        <table className='mt-2 w-full border-separate border-spacing-0 text-[13.5px]'>
          <tbody>
            <Row label='Gross amount' value={formatCents(d.grossCents, d.currency)} />
            <Row
              label={d.withholdingCents === 0 ? 'Withholding' : 'Tax withheld'}
              value={d.withholdingCents === 0 ? '—' : `− ${formatCents(d.withholdingCents, d.currency)}`}
            />
            <Row label='Net payable' tone='brand' value={formatCents(d.netCents, d.currency)} />
          </tbody>
        </table>
      </section>

      <section className='mt-5 grid grid-cols-1 gap-4 md:grid-cols-2'>
        <div>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Payment</div>
          <div className='mt-1 text-[13.5px] text-ink-800'>
            {d.paymentMethod === 'DRIP' ? 'Reinvested as additional shares (DRIP)' : `Paid via ${d.paymentMethod}`}
          </div>
          {d.externalReference && <div className='mono cell-muted text-[12px]'>Ref · {d.externalReference}</div>}
        </div>
        <div>
          <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Currency</div>
          <div className='mt-1 text-[13.5px] text-ink-800'>{d.currency}</div>
        </div>
      </section>

      <footer className='mt-6 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-500'>
        This is a platform-generated dividend statement issued by Proxi on behalf of the issuer of record. It is provided for your reference
        and is not tax advice. For any tax-form questions please consult a qualified tax advisor.
      </footer>
    </article>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{label}</div>
      <div className='mt-0.5 text-[13.5px] font-semibold text-ink-900'>{value}</div>
    </div>
  )
}

function Row({ label, tone, value }: { label: string; tone?: 'brand'; value: string }) {
  return (
    <tr>
      <td className='py-1.5 text-ink-600'>{label}</td>
      <td className={`num py-1.5 text-right font-semibold ${tone === 'brand' ? 'text-brand-700' : 'text-ink-900'}`}>{value}</td>
    </tr>
  )
}
