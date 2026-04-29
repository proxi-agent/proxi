import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { Icon } from '@/components/icon'
import { DividendStatement } from '@/components/investor/dividend-statement'
import { Badge, PageHeader } from '@/components/ui'
import { fetchMyStatement } from '@/lib/dividends/shareholder'

import { PrintButton } from './print-button'

export default async function InvestorDividendStatementPage({ params }: { params: Promise<{ dividendId: string }> }) {
  const { dividendId } = await params
  const statement = await fetchMyStatement(dividendId)
  if (!statement) notFound()

  return (
    <AppShell
      breadcrumbs={[
        { href: '/investor', label: 'Investor' },
        { href: '/investor/dividends', label: 'Dividends' },
        { href: `/investor/dividends/${dividendId}`, label: statement.dividend.issuerName },
        { label: 'Statement' },
      ]}
      portal='investor'
    >
      <PageHeader
        actions={
          <>
            <Link className='btn btn-ghost btn-sm' href={`/investor/dividends/${dividendId}`}>
              <Icon name='arrow-left' size={13} />
              Back
            </Link>
            <PrintButton />
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>Statement</Badge>
            <span className='text-[12px] text-ink-500'>
              {statement.dividend.issuerName} · {statement.dividend.securityLabel}
            </span>
          </div>
        }
        subtitle='Use your browser print dialog (⌘P / Ctrl+P) to save as PDF or print.'
        title='Dividend statement'
      />

      <div className='mx-auto max-w-3xl'>
        <DividendStatement statement={statement} />
      </div>
    </AppShell>
  )
}
