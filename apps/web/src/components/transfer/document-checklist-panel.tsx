import { Icon } from '@/components/icon'
import { Badge, Confidence, Panel } from '@/components/ui'
import { DOCUMENT_LABEL } from '@/lib/transfer/copy'
import type { DocumentState, TransferDocument } from '@/lib/transfer/types'

const STATE_META: Record<DocumentState, { icon: string; label: string; tone: 'danger' | 'info' | 'neutral' | 'positive' | 'warning' }> = {
  accepted: { icon: 'check-circle', label: 'Accepted', tone: 'positive' },
  missing: { icon: 'circle-dashed', label: 'Missing', tone: 'danger' },
  'needs-reupload': { icon: 'refresh-cw', label: 'Needs re-upload', tone: 'warning' },
  pending: { icon: 'clock', label: 'Processing', tone: 'info' },
  received: { icon: 'inbox', label: 'Received', tone: 'info' },
  rejected: { icon: 'x-circle', label: 'Rejected', tone: 'danger' },
}

export function DocumentChecklistPanel({
  actions,
  compact,
  documents,
  subtitle,
  title = 'Documents',
}: {
  actions?: React.ReactNode
  compact?: boolean
  documents: TransferDocument[]
  subtitle?: string
  title?: string
}) {
  const total = documents.length
  const accepted = documents.filter(d => d.state === 'accepted').length

  return (
    <Panel
      actions={actions}
      subtitle={subtitle ?? `${accepted}/${total} received · required evidence for this transfer type`}
      title={title}
    >
      <ul className='flex flex-col divide-y divide-line -my-4'>
        {documents.map(d => {
          const state = STATE_META[d.state]
          return (
            <li className='flex items-start gap-3 py-3' key={d.id}>
              <div className='mt-0.5 flex h-9 w-9 items-center justify-center rounded-sm bg-surface-sunken text-ink-700'>
                <Icon name={d.state === 'missing' ? 'file-plus' : 'file-text'} size={15} />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='truncate text-[13px] font-semibold text-ink-900'>{d.name}</span>
                  <Badge icon={state.icon} tone={state.tone}>
                    {state.label}
                  </Badge>
                  {!d.required && (
                    <Badge outline tone='neutral'>
                      Optional
                    </Badge>
                  )}
                </div>
                {!compact && (
                  <div className='mt-0.5 text-[11.5px] text-ink-500'>
                    {DOCUMENT_LABEL[d.type]}
                    {d.pages ? ` · ${d.pages} pages` : ''}
                    {d.size ? ` · ${d.size}` : ''}
                    {d.hash ? ` · ${d.hash}` : ''}
                  </div>
                )}
                {d.issueNote && (
                  <div className='mt-1 flex items-start gap-1.5 text-[12px] text-warning-700'>
                    <Icon name='alert-triangle' size={12} />
                    <span>{d.issueNote}</span>
                  </div>
                )}
              </div>
              {typeof d.aiConfidence === 'number' && d.aiConfidence > 0 && (
                <div className='shrink-0'>
                  <Confidence value={d.aiConfidence} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
