'use client'

import { useEffect, useMemo, useState } from 'react'

import { FormField, FormSection } from '@/components/form'
import { Icon } from '@/components/icon'
import { InfoTooltip } from '@/components/info-tooltip'
import { Badge } from '@/components/ui'
import { API_BASE } from '@/lib/api/base-url'
import { fetchIssuerOptions, fetchSecurityOptions } from '@/lib/dividends/api'
import { DIVIDEND_TYPE_OPTIONS, RATE_TYPE_OPTIONS, TOOLTIPS } from '@/lib/dividends/copy'
import type { DividendEvent, DividendFormIssuerOption, DividendRateType, DividendType } from '@/lib/dividends/types'

export type DividendFormValues = {
  currency: string
  declarationDate: string
  dividendType: DividendType
  exDividendDate: string
  issuerId: string
  notes: string
  paymentDate: string
  rateAmount: string
  rateType: DividendRateType
  recordDate: string
  securityId: string
  supportingDoc: string
}

const FALLBACK_ISSUER_OPTIONS: DividendFormIssuerOption[] = [
  { id: 'iss_halcyon', label: 'Halcyon Industrial Co. (HALC)' },
  { id: 'iss_meridian', label: 'Meridian Optics, Inc. (MRDN)' },
  { id: 'iss_ridgefield', label: 'Ridgefield Energy Holdings (RDG)' },
]

const FALLBACK_SECURITY_OPTIONS_BY_ISSUER: Record<string, Array<{ id: string; label: string }>> = {
  iss_halcyon: [{ id: 'sec_halcyon_common', label: 'HALC — Common stock' }],
  iss_meridian: [
    { id: 'sec_meridian_common', label: 'MRDN — Common stock' },
    { id: 'sec_meridian_pref', label: 'MRDN — Preferred (rare)' },
  ],
  iss_ridgefield: [
    { id: 'sec_ridgefield_common', label: 'RDG — Common stock' },
    { id: 'sec_ridgefield_prefa', label: 'RDG — Series A preferred' },
  ],
}

function defaultsFromDividend(d?: DividendEvent): DividendFormValues {
  return {
    currency: d?.currency ?? 'USD',
    declarationDate: d?.declarationDate ?? '',
    dividendType: d?.dividendType ?? 'CASH',
    exDividendDate: d?.exDividendDate ?? '',
    issuerId: d?.issuer.id ?? 'iss_meridian',
    notes: d?.notes ?? '',
    paymentDate: d?.paymentDate ?? '',
    rateAmount: d?.rateAmount ?? '',
    rateType: d?.rateType ?? 'PER_SHARE',
    recordDate: d?.recordDate ?? '',
    securityId: d?.security.id ?? 'sec_meridian_common',
    supportingDoc: '',
  }
}

function validate(v: DividendFormValues) {
  const errors: Partial<Record<keyof DividendFormValues, string>> = {}
  if (!v.issuerId) errors.issuerId = 'Issuer is required'
  if (!v.securityId) errors.securityId = 'Security is required'
  if (!v.declarationDate) errors.declarationDate = 'Declaration date is required'
  if (!v.recordDate) errors.recordDate = 'Record date is required'
  if (!v.paymentDate) errors.paymentDate = 'Payment date is required'
  if (!v.rateAmount) errors.rateAmount = 'Rate amount is required'
  else if (Number(v.rateAmount) <= 0) errors.rateAmount = 'Must be greater than 0'
  if (v.declarationDate && v.recordDate && v.recordDate < v.declarationDate) {
    errors.recordDate = 'Record date cannot be before the declaration date'
  }
  if (v.recordDate && v.paymentDate && v.paymentDate < v.recordDate) {
    errors.paymentDate = 'Payment date cannot be before the record date'
  }
  if (v.exDividendDate && v.recordDate && v.exDividendDate > v.recordDate) {
    errors.exDividendDate = 'Ex-date is normally on or before the record date'
  }
  return errors
}

export function DividendForm({
  disabled = false,
  dividend,
  mode,
  onCancel,
  onSubmit,
}: {
  disabled?: boolean
  dividend?: DividendEvent
  mode: 'create' | 'edit'
  onCancel?: () => void
  onSubmit?: (values: DividendFormValues, intent: 'draft' | 'submit') => void
}) {
  const [values, setValues] = useState<DividendFormValues>(defaultsFromDividend(dividend))
  const [touched, setTouched] = useState<Partial<Record<keyof DividendFormValues, boolean>>>({})
  const [issuerOptions, setIssuerOptions] = useState<DividendFormIssuerOption[]>(FALLBACK_ISSUER_OPTIONS)
  const [securityOptionsByIssuer, setSecurityOptionsByIssuer] = useState<Record<string, Array<{ id: string; label: string }>>>(FALLBACK_SECURITY_OPTIONS_BY_ISSUER)

  const errors = useMemo(() => validate(values), [values])
  const securityOptions = securityOptionsByIssuer[values.issuerId] ?? []

  useEffect(() => {
    let alive = true
    void (async () => {
      const [issuers, securities] = await Promise.all([fetchIssuerOptions(), fetchSecurityOptions()])
      if (!alive) return

      const nextIssuerOptions = issuers.length > 0 ? issuers : API_BASE ? [] : FALLBACK_ISSUER_OPTIONS
      const grouped: Record<string, Array<{ id: string; label: string }>> = {}
      for (const security of securities) {
        if (!grouped[security.issuerId]) grouped[security.issuerId] = []
        grouped[security.issuerId].push({ id: security.id, label: security.label })
      }
      for (const issuerId of Object.keys(grouped)) {
        grouped[issuerId] = grouped[issuerId].sort((a, b) => a.label.localeCompare(b.label))
      }
      const nextSecurityOptionsByIssuer = Object.keys(grouped).length > 0 ? grouped : API_BASE ? {} : FALLBACK_SECURITY_OPTIONS_BY_ISSUER

      setIssuerOptions(nextIssuerOptions)
      setSecurityOptionsByIssuer(nextSecurityOptionsByIssuer)
      setValues(prev => {
        let issuerId = prev.issuerId
        if (!nextIssuerOptions.some(option => option.id === issuerId)) {
          issuerId = nextIssuerOptions[0]?.id ?? ''
        }
        const issuerSecurityOptions = nextSecurityOptionsByIssuer[issuerId] ?? []
        let securityId = prev.securityId
        if (!issuerSecurityOptions.some(option => option.id === securityId)) {
          securityId = issuerSecurityOptions[0]?.id ?? ''
        }
        if (issuerId === prev.issuerId && securityId === prev.securityId) {
          return prev
        }
        return { ...prev, issuerId, securityId }
      })
    })()
    return () => {
      alive = false
    }
  }, [])

  const set = <K extends keyof DividendFormValues>(key: K, value: DividendFormValues[K]) => {
    setValues(v => ({ ...v, [key]: value }))
    setTouched(t => ({ ...t, [key]: true }))
  }

  const showError = (key: keyof DividendFormValues) => (touched[key] ? errors[key] : undefined)

  const handle = (intent: 'draft' | 'submit') => (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({
      declarationDate: true,
      issuerId: true,
      paymentDate: true,
      rateAmount: true,
      recordDate: true,
      securityId: true,
    })
    if (Object.keys(errors).length > 0) return
    onSubmit?.(values, intent)
  }

  return (
    <form className='flex flex-col gap-5' onSubmit={handle('draft')}>
      <FormSection subtitle='Who is paying the dividend and on what security' title='Issuer & security'>
        <FormField error={showError('issuerId')} label='Issuer' required>
          {p => (
            <select
              {...p}
              className='input'
              disabled={issuerOptions.length === 0}
              onChange={e => {
                set('issuerId', e.target.value)
                const next = securityOptionsByIssuer[e.target.value]?.[0]
                set('securityId', next?.id ?? '')
              }}
              value={values.issuerId}
            >
              {issuerOptions.length === 0 && <option value=''>No issuers available</option>}
              {issuerOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField error={showError('securityId')} label='Security / class' required>
          {p => (
            <select
              {...p}
              className='input'
              disabled={securityOptions.length === 0}
              onChange={e => set('securityId', e.target.value)}
              value={values.securityId}
            >
              {securityOptions.length === 0 && <option value=''>No securities available for this issuer</option>}
              {securityOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </FormSection>

      <FormSection subtitle='Cash, special cash, return of capital, or stock' title='Financial terms'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <FormField label='Dividend type' required>
            {p => (
              <select
                {...p}
                className='input'
                onChange={e => set('dividendType', e.target.value as DividendType)}
                value={values.dividendType}
              >
                {DIVIDEND_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label='Rate type' required>
            {p => (
              <select {...p} className='input' onChange={e => set('rateType', e.target.value as DividendRateType)} value={values.rateType}>
                {RATE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            error={showError('rateAmount')}
            help={
              <span className='inline-flex items-center gap-1'>
                Per share rate
                <InfoTooltip>{TOOLTIPS.perShareRate}</InfoTooltip>
              </span>
            }
            label='Rate amount'
            required
          >
            {p => (
              <input
                {...p}
                className='input'
                inputMode='decimal'
                onChange={e => set('rateAmount', e.target.value)}
                placeholder='0.18'
                value={values.rateAmount}
              />
            )}
          </FormField>
        </div>
        <FormField label='Currency'>
          {p => (
            <select {...p} className='input md:max-w-[200px]' onChange={e => set('currency', e.target.value)} value={values.currency}>
              <option value='USD'>USD — US Dollar</option>
              <option value='EUR'>EUR — Euro</option>
              <option value='GBP'>GBP — Pound sterling</option>
              <option value='CAD'>CAD — Canadian dollar</option>
            </select>
          )}
        </FormField>
      </FormSection>

      <FormSection subtitle='Validation enforces declaration ≤ record ≤ payment, with an optional ex-date.' title='Important dates'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <FormField error={showError('declarationDate')} label='Declaration date' required>
            {p => (
              <input
                {...p}
                className='input'
                onChange={e => set('declarationDate', e.target.value)}
                type='date'
                value={values.declarationDate}
              />
            )}
          </FormField>
          <FormField
            error={showError('recordDate')}
            help={
              <span className='inline-flex items-center gap-1'>
                Holders on this date are eligible
                <InfoTooltip>{TOOLTIPS.recordDate}</InfoTooltip>
              </span>
            }
            label='Record date'
            required
          >
            {p => (
              <input {...p} className='input' onChange={e => set('recordDate', e.target.value)} type='date' value={values.recordDate} />
            )}
          </FormField>
          <FormField
            error={showError('exDividendDate')}
            help={
              <span className='inline-flex items-center gap-1'>
                Optional · usually one trading day before record
                <InfoTooltip>{TOOLTIPS.exDividendDate}</InfoTooltip>
              </span>
            }
            label='Ex-dividend date'
          >
            {p => (
              <input
                {...p}
                className='input'
                onChange={e => set('exDividendDate', e.target.value)}
                type='date'
                value={values.exDividendDate}
              />
            )}
          </FormField>
          <FormField
            error={showError('paymentDate')}
            help={
              <span className='inline-flex items-center gap-1'>
                Funds release date
                <InfoTooltip>{TOOLTIPS.paymentDate}</InfoTooltip>
              </span>
            }
            label='Payment date'
            required
          >
            {p => (
              <input {...p} className='input' onChange={e => set('paymentDate', e.target.value)} type='date' value={values.paymentDate} />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormSection subtitle='Optional context for reviewers and audit logs' title='Notes & supporting documents'>
        <FormField help='Internal notes shown to reviewers, board, and audit logs.' label='Notes'>
          {p => (
            <textarea
              {...p}
              className='input min-h-[96px]'
              onChange={e => set('notes', e.target.value)}
              placeholder='e.g. Q4 2025 regular cash dividend. ACH primary, check fallback.'
              value={values.notes}
            />
          )}
        </FormField>
        <FormField help='Reference label for an uploaded board resolution, treasurer memo, or notice template.' label='Supporting document'>
          {p => (
            <input
              {...p}
              className='input'
              onChange={e => set('supportingDoc', e.target.value)}
              placeholder='Board minutes · Jan 14, 2026.pdf'
              value={values.supportingDoc}
            />
          )}
        </FormField>
        <div className='flex items-center gap-2 text-[12px] text-ink-500'>
          <Icon name='paperclip' size={12} />
          File upload integrates with the document service · placeholder for now.
        </div>
      </FormSection>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4'>
        <div className='flex items-center gap-2 text-[12px] text-ink-500'>
          <Badge tone='neutral'>{mode === 'create' ? 'New declaration' : `Edit · v${dividend?.version ?? 1}`}</Badge>
          <span>Saved drafts go to the approval queue when submitted.</span>
        </div>
        <div className='flex items-center gap-1.5'>
          {onCancel && (
            <button className='btn btn-ghost btn-sm' disabled={disabled} onClick={onCancel} type='button'>
              Cancel
            </button>
          )}
          <button className='btn btn-secondary btn-sm' disabled={disabled} onClick={handle('draft')} type='button'>
            <Icon name='pencil' size={12} />
            Save draft
          </button>
          <button aria-busy={disabled} className='btn btn-brand btn-sm' disabled={disabled} onClick={handle('submit')} type='button'>
            <Icon className={disabled ? 'animate-spin' : undefined} name={disabled ? 'refresh-cw' : 'send'} size={12} />
            Submit for approval
          </button>
        </div>
      </div>
    </form>
  )
}
