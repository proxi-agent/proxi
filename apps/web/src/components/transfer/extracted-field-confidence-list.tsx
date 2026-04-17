'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/icon'
import { Confidence, Panel } from '@/components/ui'
import type { ExtractedField, ExtractedFieldSection } from '@/lib/transfer/types'

import { SourceInspectionPanel } from './source-inspection-panel'

const SECTION_ORDER: ExtractedFieldSection[] = ['parties', 'transfer', 'destination', 'authorizations', 'compliance']

const SECTION_LABEL: Record<ExtractedFieldSection, string> = {
  authorizations: 'Authorizations',
  compliance: 'Compliance',
  destination: 'Destination',
  parties: 'Parties & registration',
  transfer: 'Shares & security',
}

const SECTION_ICON: Record<ExtractedFieldSection, string> = {
  authorizations: 'badge-check',
  compliance: 'shield-check',
  destination: 'arrow-right',
  parties: 'users',
  transfer: 'coins',
}

function FieldRow({ field, onInspect }: { field: ExtractedField; onInspect: (f: ExtractedField) => void }) {
  const low = field.confidence < 85
  const hasLedgerDiff = field.ledgerValue !== undefined && field.ledgerValue !== field.value
  const bandClass = low ? (field.confidence < 65 ? 'border-l-danger-500' : 'border-l-warning-500') : 'border-l-positive-500'

  return (
    <li className={`grid grid-cols-[200px_1fr_160px] items-start gap-3 border-l-2 bg-surface px-4 py-3 ${bandClass}`}>
      <div>
        <div className='text-[12.5px] font-semibold text-ink-500'>{field.label}</div>
        <div className='mt-1 flex items-center gap-1 text-[11px] text-ink-400'>
          <Icon name='file-text' size={10} />
          <span className='truncate'>
            {field.sourceDoc} · p.{field.sourcePage}
          </span>
        </div>
      </div>

      <div>
        <div className='font-mono text-[13px] font-semibold text-ink-900'>{field.value}</div>

        {hasLedgerDiff && (
          <div className='mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 rounded-sm border border-warning-100 bg-warning-50 px-2.5 py-1.5 text-[11.5px]'>
            <span className='text-[10px] font-semibold uppercase tracking-[0.06em] text-warning-700'>Form</span>
            <span className='font-mono text-warning-700 line-through'>{field.value}</span>
            <span className='text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-500'>Ledger</span>
            <span className='font-mono font-semibold text-ink-900'>{field.ledgerValue}</span>
          </div>
        )}

        {low && field.sourceSnippet && (
          <div className='mt-2 flex items-start gap-1.5 rounded-sm border border-line bg-surface-sunken px-2.5 py-1.5 font-mono text-[11.5px] text-ink-600'>
            <Icon className='mt-0.5 text-ink-400' name='eye' size={10} />
            <span>
              <span className='text-ink-400'>…&nbsp;</span>
              <mark className='rounded-sm bg-brand-100 px-0.5 text-ink-900'>{field.sourceSnippet}</mark>
              <span className='text-ink-400'>&nbsp;…</span>
            </span>
          </div>
        )}

        {field.warning && (
          <div className='mt-1.5 flex items-start gap-1.5 text-[12px] text-warning-700'>
            <Icon name='alert-triangle' size={12} />
            <span>{field.warning}</span>
          </div>
        )}
        {field.note && <div className='mt-1 text-[11.5px] text-ink-500'>{field.note}</div>}
      </div>

      <div className='flex flex-col items-end gap-1.5'>
        <Confidence value={field.confidence} />
        <div className='flex items-center gap-1'>
          {low && (
            <button className='btn btn-ghost btn-sm' type='button' title='Edit value'>
              <Icon name='pencil' size={11} />
            </button>
          )}
          <button className='btn btn-ghost btn-sm' onClick={() => onInspect(field)} type='button'>
            <Icon name='external-link' size={11} />
            Source
          </button>
        </div>
      </div>
    </li>
  )
}

export function ExtractedFieldConfidenceList({
  aggregateConfidence,
  fields,
  subtitle = 'Grouped by section · source visible for any field below the straight-through threshold',
  title = 'AI-extracted fields · form-to-ledger reconciliation',
}: {
  aggregateConfidence?: number
  fields: ExtractedField[]
  subtitle?: string
  title?: string
}) {
  const [active, setActive] = useState<ExtractedField | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<ExtractedFieldSection | 'other', ExtractedField[]>()
    for (const f of fields) {
      const key = f.section ?? 'other'
      const arr = map.get(key) ?? []
      arr.push(f)
      map.set(key, arr)
    }
    return map
  }, [fields])

  const lowConfidenceCount = fields.filter(f => f.confidence < 85).length
  const varianceCount = fields.filter(f => f.ledgerValue !== undefined && f.ledgerValue !== f.value).length

  return (
    <div className='flex flex-col gap-3'>
      <Panel
        actions={
          typeof aggregateConfidence === 'number' ? (
            <div className='flex items-center gap-3 text-[12px]'>
              {varianceCount > 0 && (
                <span className='flex items-center gap-1 text-warning-700'>
                  <Icon name='alert-triangle' size={11} />
                  <span>
                    {varianceCount} variance{varianceCount === 1 ? '' : 's'}
                  </span>
                </span>
              )}
              {lowConfidenceCount > 0 && (
                <span className='flex items-center gap-1 text-ink-500'>
                  <Icon name='scan-search' size={11} />
                  <span>
                    {lowConfidenceCount} below {85}%
                  </span>
                </span>
              )}
              <span className='text-ink-500'>Overall</span>
              <Confidence value={aggregateConfidence} />
            </div>
          ) : undefined
        }
        padded={false}
        subtitle={subtitle}
        title={title}
      >
        {SECTION_ORDER.map(section => {
          const items = grouped.get(section)
          if (!items || items.length === 0) return null
          return (
            <div key={section}>
              <div className='flex items-center gap-2 border-t border-b border-line bg-surface-2 px-4 py-1.5'>
                <Icon className='text-ink-500' name={SECTION_ICON[section]} size={11} />
                <span className='text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>{SECTION_LABEL[section]}</span>
                <span className='text-[11px] text-ink-400'>· {items.length}</span>
              </div>
              <ul className='divide-y divide-line'>
                {items.map(f => (
                  <FieldRow field={f} key={f.key} onInspect={setActive} />
                ))}
              </ul>
            </div>
          )
        })}
        {grouped.get('other') && grouped.get('other')!.length > 0 && (
          <div>
            <div className='border-t border-b border-line bg-surface-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500'>
              Other
            </div>
            <ul className='divide-y divide-line'>
              {grouped.get('other')!.map(f => (
                <FieldRow field={f} key={f.key} onInspect={setActive} />
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {active && <SourceInspectionPanel field={active} onClose={() => setActive(null)} />}
    </div>
  )
}
