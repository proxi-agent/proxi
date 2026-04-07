'use client'

import Card from '../components/ui/Card'
import InfoTooltip from '../components/ui/InfoTooltip'
import MetricChart from '../components/ui/MetricChart'
import StatCard from '../components/ui/StatCard'
import { useEffect, useMemo, useState } from 'react'

interface CaseItem {
  id: number
  quantity: number
  status: string
  type: string
}

interface LedgerEvent {
  id: number
  quantity: number
  type: string
}

export default function HomePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const [cases, setCases] = useState<CaseItem[]>([])
  const [events, setEvents] = useState<LedgerEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadData() {
      setLoading(true)
      try {
        const [casesRes, eventsRes] = await Promise.all([fetch(`${apiUrl}/cases`), fetch(`${apiUrl}/ledger/events`)])
        if (!mounted) {
          return
        }
        const casesJson = (await casesRes.json()) as CaseItem[]
        const eventsJson = (await eventsRes.json()) as LedgerEvent[]
        setCases(casesJson)
        setEvents(eventsJson)
      } catch {
        if (!mounted) {
          return
        }
        setCases([])
        setEvents([])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const dashboardStats = useMemo(() => {
    const totalVolume = events.reduce((sum, event) => sum + Number(event.quantity || 0), 0)
    const openCases = cases.filter(entry => entry.status !== 'COMPLETED').length
    const completedCases = cases.filter(entry => entry.status === 'COMPLETED').length
    return [
      { label: 'Total Cases', value: String(cases.length) },
      { label: 'Open Cases', value: String(openCases) },
      { label: 'Completed Cases', value: String(completedCases) },
      { label: 'Ledger Volume', value: totalVolume.toLocaleString() },
    ]
  }, [cases, events])

  const caseTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      CANCEL: 0,
      ISSUE: 0,
      TRANSFER: 0,
    }
    cases.forEach(entry => {
      counts[entry.type] = (counts[entry.type] || 0) + 1
    })
    return Object.keys(counts)
      .sort()
      .map(key => ({
        label: key,
        value: counts[key],
      }))
  }, [cases])

  const eventVolumeByType = useMemo(() => {
    const totals: Record<string, number> = {
      ISSUE: 0,
      TRANSFER: 0,
    }
    events.forEach(entry => {
      totals[entry.type] = (totals[entry.type] || 0) + Number(entry.quantity || 0)
    })
    return Object.keys(totals)
      .sort()
      .map(key => ({
        label: key,
        value: totals[key],
      }))
  }, [events])

  return (
    <>
      <section className='mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(23,31,56,0.08)]'>
        <p className='text-xs font-bold uppercase tracking-[0.08em] text-blue-300'>Control Center</p>
        <h2 className='mt-1 text-[1.65rem] font-semibold text-slate-900'>Run transfer operations with confidence</h2>
        <p className='mt-2 max-w-[760px] text-slate-500'>
          This workspace gives transfer agents a clear operational view across case intake, ledger activity, and ownership movement.
        </p>
      </section>

      <section className='mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4' aria-label='Key metrics'>
        {dashboardStats.map(item => (
          <StatCard key={item.label} label={item.label} loading={loading} value={item.value} />
        ))}
      </section>

      <section className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <Card>
          <MetricChart
            items={caseTypeCounts}
            title='Case distribution by type'
            tooltipText='Counts of cases grouped by action type: cancel, issue, and transfer.'
          />
        </Card>
        <Card>
          <MetricChart
            items={eventVolumeByType}
            title='Ledger volume by event type'
            tooltipText='Total quantity posted to the ledger by event type.'
          />
        </Card>
        <Card>
          <div className='mb-3 inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Operational workflow</h3>
            <InfoTooltip text='Suggested end-to-end flow for handling transfer operations each day.' />
          </div>
          <ul className='grid list-decimal gap-2 pl-5 text-slate-500'>
            <li>1. Register and triage transfer requests in Cases.</li>
            <li>2. Validate issuance, cancellation, and transfer instructions.</li>
            <li>3. Post events to ledger and monitor settlement quality.</li>
            <li>4. Reconcile final holder positions for audit readiness.</li>
          </ul>
        </Card>
        <Card>
          <div className='mb-3 inline-flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-slate-900'>Recommended daily routine</h3>
            <InfoTooltip text='Quick checklist to keep case and ledger operations on schedule.' />
          </div>
          <ul className='grid list-disc gap-2 pl-5 text-slate-500'>
            <li>Review open cases and stale requests.</li>
            <li>Prioritize high-volume securities first.</li>
            <li>Check ledger for exceptions after batch processing.</li>
            <li>Confirm position movements before day-end close.</li>
          </ul>
        </Card>
      </section>
    </>
  )
}
