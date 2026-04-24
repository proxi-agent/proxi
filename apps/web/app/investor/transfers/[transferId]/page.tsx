import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { ProxiAssistant } from '@/components/assistant'
import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import {
  DocumentChecklistPanel,
  ExceptionBanner,
  HoldingsImpactCard,
  MissingInfoCallout,
  TransferAuditTimeline,
  TransferStageTracker,
  TransferStatusBadge,
  TransferSummaryCard,
  TurnaroundEstimateCard,
} from '@/components/transfer'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import { getTransfer } from '@/lib/transfer/mock'

function investorAssistantMessages(status: string) {
  if (status === 'needs-info') {
    return [
      {
        author: 'assistant' as const,
        body: "I'm tracking this case closely. To keep it moving we need two things from you: re-upload your medallion guarantee (stamp needs to be fully visible) and refresh your W-9 to reflect your current address. I can send you pre-filled links.",
        meta: 'Both items are blocking · tracker is paused until they arrive',
      },
    ]
  }
  if (status === 'posted') {
    return [
      {
        author: 'assistant' as const,
        body: "This transfer is final. Your ledger position and documents have been updated. You'll see this reflected at your destination broker within one business day.",
      },
    ]
  }
  if (status === 'draft') {
    return [
      {
        author: 'assistant' as const,
        body: "This request is still a draft. Finish guided intake to submit it — I'll walk you through what's missing.",
      },
    ]
  }
  return [
    {
      author: 'assistant' as const,
      body: "Your transfer is progressing on schedule. I'll message you here if anything needs attention.",
    },
  ]
}

function fmtOpenedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function InvestorTransferDetail({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params
  const transfer = getTransfer(transferId)

  const hasBlockers = Boolean(transfer.missingBlockers?.length || transfer.exceptions.some(e => e.blocking) || transfer.missingItems.length)

  return (
    <AppShell
      breadcrumbs={[{ href: '/investor', label: 'Dashboard' }, { href: '/investor/transfers', label: 'Transfers' }, { label: transfer.id }]}
      portal='investor'
    >
      <PageHeader
        actions={
          <>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='message-square' size={13} />
              Ask Proxi about this
            </button>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='download' size={13} />
              Download case file
            </button>
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{transfer.id}</Badge>
            <TransferStatusBadge status={transfer.status} />
            <span className='text-[12px] text-ink-500'>{TRANSFER_TYPE_LABEL[transfer.transferType]}</span>
          </div>
        }
        subtitle={`${transfer.shareCount.toLocaleString('en-US')} shares of ${transfer.holding.issuer} → ${transfer.destination.label}`}
        title='Transfer request'
      />

      {/* Case file strip — communicates regulated, permanent-record posture */}
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-ink-500'>
        <span className='flex items-center gap-1.5'>
          <Icon name='folder' size={11} />
          <span>Case</span>
          <span className='num font-semibold text-ink-800'>{transfer.id}</span>
        </span>
        <span className='h-3 w-px bg-line' />
        <span className='flex items-center gap-1.5'>
          <Icon name='history' size={11} />
          Opened {fmtOpenedDate(transfer.createdAt)}
        </span>
        <span className='h-3 w-px bg-line' />
        <span className='flex items-center gap-1.5'>
          <Icon name='landmark' size={11} />
          Registrar: Proxi Transfer Agent Services
        </span>
        <span className='h-3 w-px bg-line' />
        <span className='flex items-center gap-1.5'>
          <Icon name='lock' size={11} />
          Permanent record · audit-logged
        </span>
      </div>

      <div className='flex flex-col gap-5'>
        {/* Blocker-first hierarchy: when anything is outstanding, show actionable blockers first */}
        {hasBlockers && (transfer.missingBlockers?.length || transfer.missingItems.length) ? (
          <MissingInfoCallout
            items={transfer.missingBlockers ?? transfer.missingItems}
            primaryAction={
              transfer.status === 'draft'
                ? { href: '/investor/transfer/new', label: 'Continue intake' }
                : { href: '#upload', label: 'Upload requested items' }
            }
          />
        ) : null}

        {transfer.exceptions.length > 0 && <ExceptionBanner exceptions={transfer.exceptions} />}

        <Panel subtitle='Where your transfer is in the process' title='Current stage'>
          <TransferStageTracker stage={transfer.stage} />
          {transfer.nextStepForShareholder && (
            <div className='mt-4'>
              <Callout icon='sparkles' title='Next step for you' tone='brand'>
                {transfer.nextStepForShareholder}
              </Callout>
            </div>
          )}
        </Panel>

        <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]'>
          <div className='flex flex-col gap-5'>
            <TransferSummaryCard showAssignee={false} transfer={transfer} />

            <DocumentChecklistPanel
              documents={transfer.documents}
              subtitle='Evidence you submitted for this transfer'
              title='Your submitted documents'
            />

            <Panel subtitle='Identity verification is required for regulated transfers' title='Identity verification'>
              <dl className='dl'>
                <dt>Government ID match</dt>
                <dd>
                  {transfer.kyc.idMatch !== null ? (
                    <Badge tone='positive'>Verified · {transfer.kyc.idMatch}%</Badge>
                  ) : (
                    <Badge tone='warning'>Pending</Badge>
                  )}
                </dd>
                <dt>Liveness check</dt>
                <dd>
                  {transfer.kyc.liveness === 'passed' ? (
                    <Badge tone='positive'>Passed</Badge>
                  ) : transfer.kyc.liveness === null ? (
                    <Badge tone='warning'>Pending</Badge>
                  ) : (
                    <Badge tone='danger'>Needs retry</Badge>
                  )}
                </dd>
                <dt>Sanctions screening</dt>
                <dd>{transfer.kyc.ofac === 'cleared' ? <Badge tone='positive'>Cleared</Badge> : <Badge tone='warning'>Pending</Badge>}</dd>
                <dt>Signature guarantee</dt>
                <dd>
                  {transfer.medallion.status === 'ok' ? (
                    <Badge tone='positive'>On file</Badge>
                  ) : transfer.medallion.status === 'waived-under-threshold' ? (
                    <Badge tone='info'>Waived · below threshold</Badge>
                  ) : transfer.medallion.status === 'waived-affidavit' ? (
                    <Badge tone='info'>Affidavit of loss</Badge>
                  ) : transfer.medallion.status === 'cropped' ? (
                    <Badge tone='warning'>Re-upload required</Badge>
                  ) : (
                    <Badge tone='warning'>Not yet provided</Badge>
                  )}
                </dd>
              </dl>
            </Panel>

            <TransferAuditTimeline
              events={transfer.auditEvents}
              subtitle='Every action on your transfer is logged immutably for your protection'
              title='Request history'
            />

            <Panel subtitle='Messages between you and the transfer-agent team about this case' title='Messages'>
              {transfer.reviewerNotes.length === 0 ? (
                <EmptyState icon='message-square' title='No messages yet'>
                  If the transfer-agent team needs clarification or additional documents, their requests will appear here — and we&apos;ll
                  notify you in your inbox.
                </EmptyState>
              ) : (
                <ul className='flex flex-col gap-3'>
                  {transfer.reviewerNotes.map(n => (
                    <li className='soft-box' key={n.id}>
                      <div className='mb-1 flex items-center justify-between'>
                        <span className='text-[12.5px] font-semibold text-ink-900'>
                          {n.author} <span className='text-ink-500'>· {n.authorRole}</span>
                        </span>
                        <span className='text-[11.5px] text-ink-500'>
                          {new Date(n.at).toLocaleString('en-US', {
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className='text-[12.5px] text-ink-700'>{n.body}</div>
                    </li>
                  ))}
                  <li className='soft-box border-brand-100 bg-brand-50'>
                    <div className='flex items-start gap-2'>
                      <Icon className='mt-0.5 text-brand-700' name='sparkles' size={13} />
                      <div>
                        <div className='text-[12.5px] font-semibold text-brand-900'>Reply suggested by Proxi</div>
                        <div className='text-[12px] text-brand-900'>
                          &ldquo;I can re-scan the medallion now and resubmit it through your portal within the next hour.&rdquo;
                        </div>
                        <div className='mt-1.5 flex gap-2'>
                          <button className='btn btn-brand btn-sm' type='button'>
                            Send reply
                          </button>
                          <button className='btn btn-ghost btn-sm' type='button'>
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              )}
            </Panel>
          </div>

          <aside className='flex flex-col gap-5'>
            <TurnaroundEstimateCard transfer={transfer} />
            <HoldingsImpactCard transfer={transfer} />

            <ProxiAssistant
              footerNote='Proxi never approves transfers on your behalf.'
              messages={investorAssistantMessages(transfer.status)}
              quickActions={['What is a medallion guarantee?', 'Why is this paused?', 'Check status', 'Message my transfer agent']}
              subtitle='Request-scoped help'
              title='Proxi Assistant'
            />

            <Panel subtitle='Need help? We respond within 1 business hour.' title='Support'>
              <div className='flex flex-col gap-2 text-[12.5px]'>
                <Link className='flex items-center justify-between rounded-sm border border-line px-3 py-2 hover:border-ink-300' href='#'>
                  <span className='flex items-center gap-2'>
                    <Icon name='message-square' size={13} />
                    Open a support case
                  </span>
                  <Icon name='arrow-right' size={12} />
                </Link>
                <Link className='flex items-center justify-between rounded-sm border border-line px-3 py-2 hover:border-ink-300' href='#'>
                  <span className='flex items-center gap-2'>
                    <Icon name='book-open' size={13} />
                    How transfers work
                  </span>
                  <Icon name='arrow-right' size={12} />
                </Link>
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
