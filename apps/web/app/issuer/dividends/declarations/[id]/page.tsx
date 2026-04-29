import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { Callout } from '@/components/callout'
import {
  AiReviewCard,
  CalculationSummaryPanel,
  DividendAuditTimeline,
  DividendStatusBadge,
  DividendSummaryCard,
  DividendWarnings,
  DividendWorkflowActions,
  DividendWorkflowList,
  DividendWorkflowStepper,
  ExportButton,
  LockSnapshotButton,
  NewBatchButton,
  PaymentBatchStatusBadge,
} from '@/components/dividends'
import { Icon } from '@/components/icon'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import {
  exportUrl,
  fetchAiReviews,
  fetchAuditEvents,
  fetchBatches,
  fetchDividend,
  fetchEligibilitySnapshot,
  fetchEntitlements,
} from '@/lib/dividends/api'
import { formatCents, formatDate, formatDateTime, formatShares } from '@/lib/dividends/copy'

import { EntitlementsTable } from './entitlements-table'

type SearchParams = Promise<{ tab?: string }>

const TABS = ['overview', 'eligibility', 'calculation', 'batches', 'audit'] as const
type Tab = (typeof TABS)[number]

export default async function DividendDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const { id } = await params
  const sp = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'overview'

  const [dividend, snapshot, entitlements, batches, audit, aiReviews] = await Promise.all([
    fetchDividend(id),
    fetchEligibilitySnapshot(id),
    fetchEntitlements(id),
    fetchBatches(id),
    fetchAuditEvents(id),
    fetchAiReviews(id),
  ])

  return (
    <AppShell
      breadcrumbs={[
        { href: '/issuer', label: 'Issuer' },
        { href: '/issuer/dividends', label: 'Dividends' },
        { href: '/issuer/dividends/declarations', label: 'Declarations' },
        { label: id },
      ]}
      portal='issuer'
    >
      <PageHeader
        actions={
          <>
            <Link className='btn btn-ghost btn-sm' href='/issuer/dividends/declarations'>
              <Icon name='arrow-left' size={13} />
              Queue
            </Link>
            {dividend.allowedActions.includes('edit') && (
              <Link className='btn btn-secondary btn-sm' href={`/issuer/dividends/declarations/${id}/edit`}>
                <Icon name='pencil' size={13} />
                Edit
              </Link>
            )}
            <DividendWorkflowActions actions={dividend.allowedActions} dividendId={id} />
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{dividend.id}</Badge>
            <DividendStatusBadge status={dividend.status} />
            <span className='text-[12px] text-ink-500'>
              v{dividend.version} · updated {formatDateTime(dividend.updatedAt)}
            </span>
          </div>
        }
        subtitle={`${dividend.issuer.name} · ${dividend.security.label} · pay ${formatDate(dividend.paymentDate)}`}
        title='Dividend declaration'
      />

      <div className='mb-4'>
        <DividendSummaryCard dividend={dividend} />
      </div>

      {dividend.warnings.length > 0 && (
        <div className='mb-4'>
          <DividendWarnings warnings={dividend.warnings} />
        </div>
      )}

      <Panel
        actions={
          <Link className='btn btn-ghost btn-sm' href={`/issuer/dividends/declarations/${id}?tab=audit`}>
            <Icon name='history' size={12} />
            Audit trail
          </Link>
        }
        subtitle='Canonical 11-step dividend workflow — board review through archive'
        title='Workflow'
      >
        <DividendWorkflowStepper steps={dividend.workflow} />
      </Panel>

      <div className='mt-5'>
        <DetailTabs activeTab={tab} batchCount={batches.length} entitlementCount={entitlements.length} id={id} />
      </div>

      <div className='mt-4'>
        {tab === 'overview' && (
          <OverviewSection
            aiReviews={aiReviews}
            approvalHistory={dividend.approvalHistory}
            audit={audit}
            batches={batches}
            dividend={dividend}
            id={id}
          />
        )}
        {tab === 'eligibility' && <EligibilitySection dividendId={id} snapshot={snapshot} />}
        {tab === 'calculation' && (
          <CalculationSection
            currency={dividend.currency}
            dividendId={id}
            entitlements={entitlements}
            summary={dividend.calculatedSummary}
          />
        )}
        {tab === 'batches' && (
          <BatchesSection
            batches={batches}
            currency={dividend.currency}
            dividendId={id}
            entitlements={entitlements}
            paymentDate={dividend.paymentDate}
          />
        )}
        {tab === 'audit' && (
          <Panel
            actions={<ExportButton label='Export audit CSV' location={exportUrl('audit', { dividendId: id })} />}
            padded
            subtitle='Every workflow action recorded with actor, role, and timestamp'
            title='Audit trail'
          >
            <DividendAuditTimeline events={audit} />
          </Panel>
        )}
      </div>
    </AppShell>
  )
}

function DetailTabs({
  activeTab,
  batchCount,
  entitlementCount,
  id,
}: {
  activeTab: Tab
  batchCount: number
  entitlementCount: number
  id: string
}) {
  const items: Array<{ count?: number; id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'eligibility', label: 'Eligibility' },
    { count: entitlementCount || undefined, id: 'calculation', label: 'Calculation' },
    { count: batchCount || undefined, id: 'batches', label: 'Payment batches' },
    { id: 'audit', label: 'Audit trail' },
  ]
  return (
    <div className='tabs'>
      {items.map(t => (
        <Link
          aria-current={activeTab === t.id ? 'page' : undefined}
          className={`tab ${activeTab === t.id ? 'active' : ''}`}
          href={`/issuer/dividends/declarations/${id}?tab=${t.id}`}
          key={t.id}
        >
          {t.label}
          {t.count !== undefined && <span className='tab-count num'>{t.count}</span>}
        </Link>
      ))}
    </div>
  )
}

function OverviewSection({
  aiReviews,
  approvalHistory,
  audit,
  batches,
  dividend,
  id,
}: {
  aiReviews: Awaited<ReturnType<typeof fetchAiReviews>>
  approvalHistory: Awaited<ReturnType<typeof fetchDividend>>['approvalHistory']
  audit: Awaited<ReturnType<typeof fetchAuditEvents>>
  batches: Awaited<ReturnType<typeof fetchBatches>>
  dividend: Awaited<ReturnType<typeof fetchDividend>>
  id: string
}) {
  return (
    <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]'>
      <div className='flex flex-col gap-5'>
        <AiReviewCard dividendId={id} initialHistory={aiReviews} />

        <Panel subtitle='Step-by-step status, with timestamps and warnings' title='Workflow steps'>
          <DividendWorkflowList steps={dividend.workflow} />
        </Panel>

        {dividend.calculatedSummary && <CalculationSummaryPanel currency={dividend.currency} summary={dividend.calculatedSummary} />}

        <Panel
          actions={
            <Link className='btn btn-ghost btn-sm' href={`/issuer/dividends/declarations/${id}?tab=batches`}>
              All batches
              <Icon name='arrow-right' size={12} />
            </Link>
          }
          padded={false}
          subtitle='Bank distributions tied to this dividend'
          title='Payment batches'
        >
          {batches.length === 0 ? (
            <div className='p-8'>
              <EmptyState icon='inbox' title='No payment batches yet'>
                Batches are created after entitlements are calculated.
              </EmptyState>
            </div>
          ) : (
            <div className='table-wrap'>
              <table className='table'>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Pay date</th>
                    <th className='cell-num'># Payments</th>
                    <th className='cell-num'>Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr className='table-row-clickable' key={b.id}>
                      <td>
                        <Link className='cell-primary' href={`/issuer/dividends/batches/${b.id}`}>
                          {b.batchNumber}
                        </Link>
                        <div className='mono text-[11px] text-ink-500'>{b.id}</div>
                      </td>
                      <td className='cell-muted'>{formatDate(b.paymentDate)}</td>
                      <td className='cell-num num'>{b.paymentCount.toLocaleString('en-US')}</td>
                      <td className='cell-num num'>{formatCents(b.netTotalCents, b.currency)}</td>
                      <td>
                        <PaymentBatchStatusBadge status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <aside className='flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start'>
        <Panel subtitle='Most recent decisions on this declaration' title='Approval history'>
          {approvalHistory.length === 0 ? (
            <EmptyState icon='users' title='No approvals yet'>
              Once submitted, approvers' decisions land here.
            </EmptyState>
          ) : (
            <ol className='timeline'>
              {approvalHistory.map(a => (
                <li
                  className={`timeline-item ${a.decision === 'APPROVED' ? 'ok' : a.decision === 'REJECTED' ? 'danger' : a.decision === 'CHANGES_REQUESTED' ? 'warn' : 'info'}`}
                  key={a.id}
                >
                  <div className='timeline-meta'>{formatDateTime(a.at)}</div>
                  <div className='timeline-title'>{a.decision.replace('_', ' ').toLowerCase()}</div>
                  <div className='timeline-body'>
                    <span className='font-medium text-ink-800'>{a.actor}</span>
                    {a.reason ? ` · ${a.reason}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {dividend.notes && (
          <Panel subtitle='Visible to reviewers and audit logs' title='Notes'>
            <div className='text-[13px] leading-relaxed text-ink-700'>{dividend.notes}</div>
          </Panel>
        )}

        <Panel subtitle='Most recent system events' title='Recent activity'>
          <DividendAuditTimeline events={audit.slice(-5)} />
        </Panel>
      </aside>
    </div>
  )
}

function EligibilitySection({
  dividendId,
  snapshot,
}: {
  dividendId: string
  snapshot: Awaited<ReturnType<typeof fetchEligibilitySnapshot>>
}) {
  const eligible = snapshot.holders.filter(h => !h.excluded)
  const excluded = snapshot.holders.filter(h => h.excluded)
  return (
    <div className='flex flex-col gap-5'>
      <Panel
        actions={
          <div className='flex items-center gap-2'>
            <ExportButton label='Export snapshot' location={exportUrl('snapshot', { dividendId })} variant='ghost' />
            {snapshot.locked ? (
              <Badge icon='lock' tone='positive'>
                Snapshot locked
              </Badge>
            ) : (
              <LockSnapshotButton dividendId={dividendId} />
            )}
          </div>
        }
        subtitle={`Captured as of record date ${formatDate(snapshot.recordDate)}. Once locked, ledger changes will not affect this dividend.`}
        title='Eligibility snapshot'
      >
        <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          <Stat label='Eligible holders' value={snapshot.totalEligibleHolders.toLocaleString('en-US')} />
          <Stat label='Excluded holders' value={snapshot.excludedHolderCount.toLocaleString('en-US')} />
          <Stat label='Total eligible shares' value={formatShares(snapshot.totalEligibleShares)} />
          <Stat label='Snapshot ID' value={snapshot.id} />
        </div>
        {snapshot.warnings.length > 0 && (
          <div className='mt-4'>
            <DividendWarnings warnings={snapshot.warnings} />
          </div>
        )}
      </Panel>

      <Panel padded={false} subtitle='Holders included in entitlement calculation' title={`Eligible · ${eligible.length}`}>
        <HolderTable rows={eligible} />
      </Panel>

      <Panel
        padded={false}
        subtitle='Holders disqualified or otherwise excluded from this dividend'
        title={`Excluded · ${excluded.length}`}
      >
        {excluded.length === 0 ? (
          <div className='p-8'>
            <EmptyState icon='check-circle' title='No excluded holders' />
          </div>
        ) : (
          <HolderTable rows={excluded} />
        )}
      </Panel>

      <Callout tone='info'>
        Need to investigate a specific holder?{' '}
        <Link className='underline' href={`/issuer/dividends/declarations/${dividendId}?tab=calculation`}>
          Open the entitlement table
        </Link>{' '}
        for per-shareholder amounts and tax flags.
      </Callout>
    </div>
  )
}

function HolderTable({ rows }: { rows: Awaited<ReturnType<typeof fetchEligibilitySnapshot>>['holders'] }) {
  return (
    <div className='table-wrap'>
      <table className='table'>
        <thead>
          <tr>
            <th>Shareholder</th>
            <th>Account</th>
            <th>Residency</th>
            <th>Tax form</th>
            <th className='cell-num'>Shares</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(h => (
            <tr key={h.shareholderId}>
              <td>
                <div className='cell-primary'>{h.shareholderName}</div>
                <div className='mono text-[11px] text-ink-500'>{h.shareholderId}</div>
              </td>
              <td className='cell-muted'>{h.accountId ?? '—'}</td>
              <td className='cell-muted'>{h.taxResidency ?? 'Unknown'}</td>
              <td>
                {h.taxFormStatus ? <Badge tone={h.taxFormStatus === 'MISSING' ? 'warning' : 'neutral'}>{h.taxFormStatus}</Badge> : '—'}
              </td>
              <td className='cell-num num'>{formatShares(h.sharesHeld)}</td>
              <td className='cell-muted'>{h.disqualificationReason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CalculationSection({
  currency,
  dividendId,
  entitlements,
  summary,
}: {
  currency: string
  dividendId: string
  entitlements: Awaited<ReturnType<typeof fetchEntitlements>>
  summary?: Awaited<ReturnType<typeof fetchDividend>>['calculatedSummary']
}) {
  return (
    <div className='flex flex-col gap-5'>
      {summary ? (
        <CalculationSummaryPanel currency={currency} summary={summary} />
      ) : (
        <Panel title='Calculation pending'>
          <EmptyState icon='sparkles' title='Entitlements not yet calculated'>
            Lock the eligibility snapshot, then run the calculation engine to populate per-shareholder amounts.
          </EmptyState>
        </Panel>
      )}

      <Panel
        actions={<ExportButton label='Export CSV' location={exportUrl('entitlements', { dividendId })} />}
        padded={false}
        subtitle='Per-shareholder gross, withholding, and net amounts. Click any row to inspect details.'
        title={`Entitlements · ${entitlements.length}`}
      >
        {entitlements.length === 0 ? (
          <div className='p-8'>
            <EmptyState icon='users' title='No entitlements yet'>
              Calculation will create one row per eligible holder.
            </EmptyState>
          </div>
        ) : (
          <EntitlementsTable dividendId={dividendId} entitlements={entitlements} />
        )}
      </Panel>
    </div>
  )
}

function BatchesSection({
  batches,
  currency,
  dividendId,
  entitlements,
  paymentDate,
}: {
  batches: Awaited<ReturnType<typeof fetchBatches>>
  currency: string
  dividendId: string
  entitlements: Awaited<ReturnType<typeof fetchEntitlements>>
  paymentDate: string
}) {
  const unbatchedIds = entitlements.filter(e => e.paymentStatus === 'PENDING').map(e => e.id)
  return (
    <Panel
      actions={<NewBatchButton currency={currency} dividendId={dividendId} entitlementIds={unbatchedIds} paymentDate={paymentDate} />}
      padded={false}
      subtitle='Bank distributions tied to this dividend'
      title='Payment batches'
    >
      {batches.length === 0 ? (
        <div className='p-8'>
          <EmptyState icon='inbox' title='No batches yet'>
            Once entitlements are calculated, batches can be created from this view.{' '}
            <Link className='underline' href={`/issuer/dividends/declarations/${dividendId}?tab=calculation`}>
              Open calculation
            </Link>
            .
          </EmptyState>
        </div>
      ) : (
        <div className='table-wrap'>
          <table className='table'>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Pay date</th>
                <th className='cell-num'># Payments</th>
                <th className='cell-num'>Gross</th>
                <th className='cell-num'>Withholding</th>
                <th className='cell-num'>Net</th>
                <th>Status</th>
                <th aria-label='Open' />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => (
                <tr className='table-row-clickable' key={b.id}>
                  <td>
                    <Link className='cell-primary' href={`/issuer/dividends/batches/${b.id}`}>
                      {b.batchNumber}
                    </Link>
                    <div className='mono text-[11px] text-ink-500'>{b.id}</div>
                  </td>
                  <td className='cell-muted'>{formatDate(b.paymentDate)}</td>
                  <td className='cell-num num'>{b.paymentCount.toLocaleString('en-US')}</td>
                  <td className='cell-num num'>{formatCents(b.grossTotalCents, b.currency)}</td>
                  <td className='cell-num num'>{formatCents(b.withholdingTotalCents, b.currency)}</td>
                  <td className='cell-num num'>{formatCents(b.netTotalCents, b.currency)}</td>
                  <td>
                    <PaymentBatchStatusBadge status={b.status} />
                  </td>
                  <td>
                    <Link aria-label={`Open ${b.batchNumber}`} className='btn btn-ghost btn-sm' href={`/issuer/dividends/batches/${b.id}`}>
                      Open
                      <Icon name='arrow-right' size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className='soft-box'>
      <div className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{label}</div>
      <div className='mt-0.5 text-[14px] font-semibold text-ink-900'>{value}</div>
    </div>
  )
}
