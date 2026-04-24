import { ActionMenu } from '@/components/action-menu'
import { AppShell } from '@/components/app-shell'
import { ProxiAssistant } from '@/components/assistant'
import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import {
  DocumentChecklistPanel,
  ExceptionBanner,
  ExtractedFieldConfidenceList,
  HoldingsImpactCard,
  ReviewAtGlance,
  ReviewerDecisionPanel,
  TransferAuditTimeline,
  TransferStageTracker,
  TransferStatusBadge,
  TransferSummaryCard,
  TurnaroundEstimateCard,
} from '@/components/transfer'
import { Avatar, Badge, PageHeader, Panel } from '@/components/ui'
import { TRANSFER_TYPE_LABEL } from '@/lib/transfer/copy'
import { getTransfer } from '@/lib/transfer/mock'

export default async function AgentTransferReview({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params
  const transfer = getTransfer(transferId)

  return (
    <AppShell
      breadcrumbs={[{ href: '/agent', label: 'Workbench' }, { href: '/agent/transfers', label: 'Queue' }, { label: transfer.id }]}
      portal='agent'
    >
      <PageHeader
        actions={
          <>
            <a className='btn btn-ghost btn-sm' href='/agent/transfers' title='Back to queue'>
              <Icon name='arrow-left' size={13} />
              Queue
            </a>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='message-square' size={13} />
              Message holder
            </button>
            <button className='btn btn-brand btn-sm' type='button'>
              <Icon name='check' size={13} />
              Approve &amp; post
            </button>
            <ActionMenu
              buttonLabel='More case actions'
              items={[
                { icon: 'flag', kind: 'item', label: 'Escalate to compliance' },
                { icon: 'message-square', kind: 'item', label: 'Request more info' },
                { icon: 'pause', kind: 'item', label: 'Put on hold' },
                { kind: 'divider' },
                { danger: true, icon: 'x', kind: 'item', label: 'Reject transfer' },
              ]}
            />
          </>
        }
        eyebrow={
          <div className='flex items-center gap-2'>
            <Badge tone='brand'>{transfer.id}</Badge>
            <TransferStatusBadge status={transfer.status} />
            <span className='text-[12px] text-ink-500'>
              {TRANSFER_TYPE_LABEL[transfer.transferType]} · {transfer.issuerName}
            </span>
            {transfer.assignedReviewer && (
              <span className='flex items-center gap-1 text-[12px] text-ink-500'>
                <Icon name='user-round' size={11} />
                {transfer.assignedReviewer.name}
              </span>
            )}
          </div>
        }
        subtitle='All evidence, risks, and actions for this case — reviewer workspace'
        title='Transfer review'
      />

      <div className='flex flex-col gap-5'>
        <ReviewAtGlance transfer={transfer} />

        {transfer.exceptions.length > 0 && <ExceptionBanner exceptions={transfer.exceptions} />}

        {transfer.aiRecommendation && (
          <Callout
            actions={
              <button className='btn btn-brand btn-sm' type='button'>
                Apply suggestion
              </button>
            }
            title='Proxi recommendation'
            tone='brand'
          >
            {transfer.aiRecommendation}
          </Callout>
        )}

        <Panel subtitle='Case stage · driving the SLA clock' title='Lifecycle'>
          <TransferStageTracker stage={transfer.stage} />
        </Panel>

        <div className='grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]'>
          <div className='flex flex-col gap-5'>
            <TransferSummaryCard transfer={transfer} />

            {transfer.extractedFields.length > 0 && (
              <ExtractedFieldConfidenceList aggregateConfidence={transfer.confidence} fields={transfer.extractedFields} />
            )}

            <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
              <DocumentChecklistPanel
                actions={
                  <button className='btn btn-ghost btn-sm' type='button'>
                    <Icon name='upload' size={13} />
                    Upload
                  </button>
                }
                documents={transfer.documents}
                subtitle='Evidence linked to this case'
                title='Documents'
              />

              <Panel subtitle='Identity verification artifacts' title='KYC & identity'>
                <ul className='flex flex-col gap-2'>
                  <li className='soft-box flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Icon
                        className={transfer.kyc.idMatch !== null ? 'text-positive-500' : 'text-ink-400'}
                        name='shield-check'
                        size={14}
                      />
                      <div>
                        <div className='text-[13px] font-semibold text-ink-900'>Government ID match</div>
                        <div className='text-[11.5px] text-ink-500'>Face match · liveness · document authenticity</div>
                      </div>
                    </div>
                    <Badge tone={transfer.kyc.idMatch !== null ? 'positive' : 'warning'}>
                      {transfer.kyc.idMatch !== null ? `${transfer.kyc.idMatch}%` : 'Pending'}
                    </Badge>
                  </li>
                  <li className='soft-box flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Icon
                        className={transfer.kyc.ofac === 'cleared' ? 'text-positive-500' : 'text-warning-500'}
                        name='shield-check'
                        size={14}
                      />
                      <div>
                        <div className='text-[13px] font-semibold text-ink-900'>OFAC / SDN screening</div>
                        <div className='text-[11.5px] text-ink-500'>Refinitiv World-Check · all variants scored</div>
                      </div>
                    </div>
                    <Badge tone={transfer.kyc.ofac === 'cleared' ? 'positive' : 'warning'}>
                      {transfer.kyc.ofac === 'cleared' ? 'Clear' : 'Pending'}
                    </Badge>
                  </li>
                  <li className='soft-box flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Icon
                        className={
                          transfer.medallion.status === 'ok' ||
                          transfer.medallion.status === 'waived-under-threshold' ||
                          transfer.medallion.status === 'waived-affidavit'
                            ? 'text-positive-500'
                            : 'text-warning-500'
                        }
                        name='badge-check'
                        size={14}
                      />
                      <div>
                        <div className='text-[13px] font-semibold text-ink-900'>Medallion / signature guarantee</div>
                        <div className='text-[11.5px] text-ink-500'>{transfer.medallion.note ?? transfer.medallion.guarantor ?? '—'}</div>
                      </div>
                    </div>
                    <Badge
                      tone={
                        transfer.medallion.status === 'ok' ||
                        transfer.medallion.status === 'waived-under-threshold' ||
                        transfer.medallion.status === 'waived-affidavit'
                          ? 'positive'
                          : 'warning'
                      }
                    >
                      {transfer.medallion.status.replace('-', ' ')}
                    </Badge>
                  </li>
                </ul>
              </Panel>
            </div>

            <HoldingsImpactCard transfer={transfer} />

            {transfer.reviewerNotes.length > 0 && (
              <Panel subtitle='Attached to this case · visible to other reviewers' title='Internal notes'>
                <ul className='flex flex-col gap-2'>
                  {transfer.reviewerNotes.map(n => (
                    <li className='soft-box' key={n.id}>
                      <div className='mb-1 flex items-center justify-between'>
                        <span className='flex items-center gap-2 text-[12.5px]'>
                          <Avatar name={n.author} size={20} tone='ink' />
                          <span className='font-semibold text-ink-900'>{n.author}</span>
                          <span className='text-ink-500'>· {n.authorRole}</span>
                        </span>
                        {n.tag && <Badge tone='info'>{n.tag}</Badge>}
                      </div>
                      <div className='text-[12.5px] text-ink-700'>{n.body}</div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <TransferAuditTimeline events={transfer.auditEvents} />
          </div>

          <aside className='flex flex-col gap-5'>
            <div className='sticky top-4 flex flex-col gap-5'>
              <ReviewerDecisionPanel transfer={transfer} />
              <TurnaroundEstimateCard transfer={transfer} />

              <ProxiAssistant
                footerNote='The assistant cannot approve on your behalf.'
                messages={[
                  {
                    author: 'assistant',
                    body:
                      transfer.exceptions.length > 0
                        ? `I flagged ${transfer.exceptions.length} issue${transfer.exceptions.length === 1 ? '' : 's'} on this case. ${transfer.exceptions[0].title}${transfer.exceptions[0].suggestedAction ? ` — ${transfer.exceptions[0].suggestedAction.toLowerCase()}` : ''}.`
                        : 'This case has no open exceptions and confidence is high. You can approve with one click.',
                    meta:
                      transfer.confidenceBand === 'high'
                        ? 'Confidence: high'
                        : transfer.confidenceBand === 'medium'
                          ? 'Confidence: medium'
                          : 'Confidence: low — reviewer attention recommended',
                  },
                  {
                    author: 'user',
                    body: 'Show similar approved cases in the last 90 days.',
                  },
                  {
                    author: 'assistant',
                    body: 'Found 12 similar cases approved with reviewer override on name variance. 0 were later reversed. Median time-to-decision: 6m.',
                    meta: 'Precedents · View evidence →',
                  },
                ]}
                quickActions={['Explain low confidence', 'Show precedents', 'Draft holder message', 'Ping KYC specialist']}
                subtitle='Case-scoped assistant'
                title='Proxi copilot'
              />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
