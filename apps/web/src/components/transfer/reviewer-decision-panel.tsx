'use client'

import { useState } from 'react'

import { Callout } from '@/components/callout'
import { Icon } from '@/components/icon'
import { Badge, Panel } from '@/components/ui'
import type { TransferRequest } from '@/lib/transfer/types'

type Action = 'approve' | 'escalate' | 'info' | 'reassign' | 'reject'

const ACTION_META: Record<
  Action,
  {
    body: string
    btnClass: string
    icon: string
    key: string
    label: string
    primaryVerb: string
    short: string
  }
> = {
  approve: {
    body: 'Post to the shareholder ledger of record and generate DTC / mail confirmations.',
    btnClass: 'btn btn-brand flex-1',
    icon: 'check',
    key: 'A',
    label: 'Approve & post to ledger',
    primaryVerb: 'Post',
    short: 'Approve',
  },
  escalate: {
    body: 'Route to compliance with your reasoning. SLA is paused during escalation.',
    btnClass: 'btn btn-secondary flex-1',
    icon: 'flag',
    key: 'E',
    label: 'Escalate to compliance',
    primaryVerb: 'Escalate',
    short: 'Escalate',
  },
  info: {
    body: 'Send a structured request-for-information to the shareholder. SLA pauses until they reply.',
    btnClass: 'btn btn-secondary flex-1',
    icon: 'help-circle',
    key: 'I',
    label: 'Request information',
    primaryVerb: 'Send',
    short: 'Info',
  },
  reassign: {
    body: 'Hand this case to another reviewer on the bench.',
    btnClass: 'btn btn-secondary flex-1',
    icon: 'user-round',
    key: 'R',
    label: 'Reassign reviewer',
    primaryVerb: 'Reassign',
    short: 'Reassign',
  },
  reject: {
    body: 'Reject the request and notify the holder with your reasoning. This is final.',
    btnClass: 'btn btn-danger flex-1',
    icon: 'x',
    key: 'X',
    label: 'Reject request',
    primaryVerb: 'Reject',
    short: 'Reject',
  },
}

export function ReviewerDecisionPanel({
  dualControlRequired = true,
  transfer,
}: {
  dualControlRequired?: boolean
  transfer: TransferRequest
}) {
  const [action, setAction] = useState<Action>('approve')
  const [note, setNote] = useState('')
  const meta = ACTION_META[action]
  const actions = Object.keys(ACTION_META) as Action[]

  const approvers = ['Daniel Chen', 'Aisha Khan', 'Mateo Rivas']
  const hasBlockers = transfer.exceptions.some(e => e.blocking)
  const approveDisabled = action === 'approve' && hasBlockers

  return (
    <Panel
      actions={
        <span className='flex items-center gap-1 text-[11px] text-ink-400'>
          <Icon name='lock' size={11} />
          Permanently logged
        </span>
      }
      subtitle='Sensitive action · dual control when required'
      title='Decision'
    >
      <div className='flex flex-col gap-3'>
        <div className='grid grid-cols-5 gap-1 rounded-md border border-line p-1' role='radiogroup'>
          {actions.map(a => {
            const m = ACTION_META[a]
            const active = a === action
            return (
              <button
                aria-pressed={active}
                className={`relative flex flex-col items-center gap-1 rounded-sm px-1 py-2 text-[11px] font-medium transition ${active ? 'bg-surface-sunken text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}
                key={a}
                onClick={() => setAction(a)}
                type='button'
              >
                <Icon name={m.icon} size={14} />
                <span className='whitespace-nowrap'>{m.short}</span>
                <kbd className='absolute top-0.5 right-0.5 rounded-sm bg-surface-sunken px-1 text-[9px] font-mono text-ink-400'>
                  {m.key}
                </kbd>
              </button>
            )
          })}
        </div>

        <div className='text-[12px] text-ink-500'>{meta.body}</div>

        <label className='text-[12px] font-medium text-ink-700'>
          {action === 'info' ? 'Information requested' : 'Reviewer rationale'}
          <textarea
            className='textarea mt-1 min-h-[96px]'
            onChange={e => setNote(e.target.value)}
            placeholder={
              action === 'info'
                ? 'e.g. Please re-upload your medallion guarantee with the full stamp visible within the page boundary.'
                : 'Document your rationale — this note becomes part of the immutable case record.'
            }
            value={note}
          />
          <span className='mt-1 flex items-center gap-1 text-[11px] text-ink-400'>
            <Icon name='info' size={10} />
            Saved verbatim with your credentials and timestamp.
          </span>
        </label>

        {action === 'reassign' && (
          <label className='text-[12px] font-medium text-ink-700'>
            Reassign to
            <select className='input mt-1'>
              <option>Daniel Chen · Senior reviewer</option>
              <option>Aisha Khan · Compliance reviewer</option>
              <option>Mateo Rivas · Entity actions desk</option>
              <option>Rhea Patel · KYC specialist</option>
            </select>
          </label>
        )}

        {action === 'approve' && dualControlRequired && (
          <div className='rounded-md border border-line bg-surface-2 px-3 py-2.5'>
            <div className='flex items-center justify-between'>
              <span className='flex items-center gap-2 text-[12.5px] text-ink-800'>
                <Icon name='lock' size={13} />
                Second approver required
              </span>
              <Badge tone='info'>Dual control</Badge>
            </div>
            <div className='mt-2 flex items-center gap-1'>
              {approvers.map(a => (
                <span className='rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-600 ring-1 ring-line' key={a}>
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {approveDisabled && <Callout tone='danger'>Cannot post while blocking exceptions remain open. Resolve or escalate first.</Callout>}

        <div className='flex gap-2'>
          <button
            aria-disabled={approveDisabled}
            className={`${meta.btnClass} ${approveDisabled ? 'opacity-50' : ''}`}
            disabled={approveDisabled}
            type='button'
          >
            <Icon name={meta.icon} size={14} />
            {meta.label}
          </button>
          <button className='btn btn-ghost' type='button'>
            Cancel
          </button>
        </div>

        <div className='flex items-center gap-2 text-[11px] text-ink-400'>
          <kbd className='rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-500'>⏎</kbd>
          <span>to confirm ·</span>
          <kbd className='rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-500'>Esc</kbd>
          <span>to cancel</span>
        </div>
      </div>
    </Panel>
  )
}
