'use client'

import { Icon } from '@/components/icon'
import { Badge, Confidence } from '@/components/ui'
import type { ExtractedField } from '@/lib/transfer/types'

export function SourceInspectionPanel({ field, onClose }: { field: ExtractedField | null; onClose: () => void }) {
  if (!field) return null

  return (
    <div className='panel p-0'>
      <header className='flex items-center justify-between border-b border-line px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Icon className='text-ink-500' name='eye' size={14} />
          <span className='text-[13px] font-semibold text-ink-900'>Source inspection</span>
        </div>
        <button className='btn btn-ghost btn-sm' onClick={onClose} type='button'>
          <Icon name='x' size={13} />
          Close
        </button>
      </header>

      <div className='grid grid-cols-1 gap-0 md:grid-cols-[1fr_280px]'>
        <div className='border-r border-line bg-surface-sunken p-4'>
          <div className='mb-2 text-[11px] uppercase tracking-[0.08em] text-ink-500'>
            {field.sourceDoc} · page {field.sourcePage}
          </div>
          <div className='rounded-md border border-line bg-white p-4 font-mono text-[12px] leading-relaxed text-ink-800'>
            {field.sourceSnippet ? (
              <>
                <span className='text-ink-500'>…&nbsp;</span>
                <mark className='bg-brand-100 px-1 text-ink-900 rounded-sm'>{field.sourceSnippet}</mark>
                <span className='text-ink-500'>&nbsp;…</span>
              </>
            ) : (
              <span className='text-ink-500'>
                No source snippet captured. Open the original document in the viewer to inspect this field&apos;s provenance.
              </span>
            )}
          </div>
          <div className='mt-3 flex items-center gap-2'>
            <button className='btn btn-secondary btn-sm' type='button'>
              <Icon name='external-link' size={12} />
              Open document
            </button>
            <button className='btn btn-ghost btn-sm' type='button'>
              <Icon name='download' size={12} />
              Download
            </button>
          </div>
        </div>

        <aside className='flex flex-col gap-3 p-4'>
          <div>
            <div className='text-[11px] uppercase tracking-[0.08em] text-ink-500'>Field</div>
            <div className='text-[13px] font-semibold text-ink-900'>{field.label}</div>
          </div>
          <div>
            <div className='text-[11px] uppercase tracking-[0.08em] text-ink-500'>Extracted value</div>
            <div className='text-[13px] font-semibold text-ink-900 wrap-break-word'>{field.value}</div>
          </div>
          <div>
            <div className='text-[11px] uppercase tracking-[0.08em] text-ink-500'>AI confidence</div>
            <Confidence value={field.confidence} />
          </div>
          {field.warning && (
            <div className='flex items-start gap-1.5 rounded-sm border border-warning-100 bg-warning-50 p-2 text-[12px] text-warning-700'>
              <Icon name='alert-triangle' size={12} />
              <span>{field.warning}</span>
            </div>
          )}
          {field.note && <div className='text-[12px] text-ink-600'>{field.note}</div>}
          <div className='mt-1 flex flex-wrap gap-1.5'>
            {field.edited && <Badge tone='info'>Edited by reviewer</Badge>}
            {field.approved && <Badge tone='positive'>Reviewer approved</Badge>}
          </div>
        </aside>
      </div>
    </div>
  )
}
