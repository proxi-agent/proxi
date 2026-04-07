'use client'

import Card from '../../components/ui/Card'
import InfoTooltip from '../../components/ui/InfoTooltip'
import PageHeader from '../../components/ui/PageHeader'
import { useEffect, useState } from 'react'

interface ReportsSummary {
  exceptionRatePct: number
  openBreaks: number
  reconciliationAccuracyPct: number
  totalCases: number
  totalLedgerEvents: number
}

export default function ReportsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [summary, setSummary] = useState<ReportsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadSummary() {
      setLoading(true)
      try {
        const response = await fetch(`${apiUrl}/operations/reports/summary`)
        if (!response.ok) {
          throw new Error('Unable to load report summary.')
        }
        const payload = (await response.json()) as ReportsSummary
        if (!mounted) {
          return
        }
        setSummary(payload)
      } catch {
        if (!mounted) {
          return
        }
        setSummary(null)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadSummary()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  return (
    <>
      <PageHeader
        eyebrow='Reports'
        metric={summary ? `${summary.totalCases} cases in period` : 'Operational snapshot'}
        title='Generate operational and compliance summaries'
      />
      {loading ? (
        <Card>
          <p>Loading report summary...</p>
        </Card>
      ) : !summary ? (
        <Card>
          <p>No report summary is available.</p>
        </Card>
      ) : (
        <>
          <section className='mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <Card>
              <div className='inline-flex items-center gap-2'>
                <p className='text-sm text-slate-500'>Total cases</p>
                <InfoTooltip text='All processed and in-flight cases in the current reporting window.' />
              </div>
              <p className='mt-1 text-2xl font-bold text-slate-900'>{summary.totalCases}</p>
            </Card>
            <Card>
              <div className='inline-flex items-center gap-2'>
                <p className='text-sm text-slate-500'>Total ledger events</p>
                <InfoTooltip text='All ledger postings recorded in the same reporting window.' />
              </div>
              <p className='mt-1 text-2xl font-bold text-slate-900'>{summary.totalLedgerEvents}</p>
            </Card>
            <Card>
              <div className='inline-flex items-center gap-2'>
                <p className='text-sm text-slate-500'>Exception rate</p>
                <InfoTooltip text='Percentage of operations that resulted in an exception.' />
              </div>
              <p className='mt-1 text-2xl font-bold text-slate-900'>{summary.exceptionRatePct}%</p>
            </Card>
            <Card>
              <div className='inline-flex items-center gap-2'>
                <p className='text-sm text-slate-500'>Reconciliation accuracy</p>
                <InfoTooltip text='Percentage of expected positions matching ledger balances.' />
              </div>
              <p className='mt-1 text-2xl font-bold text-slate-900'>{summary.reconciliationAccuracyPct}%</p>
            </Card>
          </section>
          <Card>
            <div className='mb-3 inline-flex items-center gap-2'>
              <h3 className='text-lg font-semibold text-slate-900'>Operations summary</h3>
              <InfoTooltip text='Quick interpretation of current operational health.' />
            </div>
            <ul className='grid list-disc gap-2 pl-5 text-slate-500'>
              <li>Cases processed: {summary.totalCases.toLocaleString()}.</li>
              <li>Ledger events posted: {summary.totalLedgerEvents.toLocaleString()}.</li>
              <li>Open reconciliation breaks: {summary.openBreaks}.</li>
              <li>Exception rate currently sits at {summary.exceptionRatePct}%.</li>
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
