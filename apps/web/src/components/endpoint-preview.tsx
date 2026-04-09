'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-client'
import ValueBadge from '@/components/value-badge'

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

function isRecord(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatCell(value: JsonValue): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null) {
    return '-'
  }
  if (Array.isArray(value)) {
    return value.length ? `${value.length} items` : '[]'
  }
  return '{...}'
}

function shouldBadge(key: string, value: JsonValue): boolean {
  if (typeof value !== 'string') {
    return false
  }
  return ['lifecycleStage', 'riskTier', 'severity', 'status'].includes(key)
}

function renderPortalMock(data: JsonObject) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : []
  const notes = Array.isArray(data.notes) ? data.notes : []
  const table = Array.isArray(data.table) ? data.table : []
  return (
    <div className='space-y-3'>
      {highlights.length ? (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          {highlights.map((item, index) => {
            const row = isRecord(item) ? item : {}
            const label = typeof row.label === 'string' ? row.label : `Metric ${index + 1}`
            const value = formatCell(row.value ?? null)
            return (
              <div className='rounded-lg border border-blue-100 bg-blue-50 p-3' key={`${label}-${index}`}>
                <p className='text-[11px] font-semibold uppercase tracking-wide text-blue-700'>{label}</p>
                <p className='mt-1 text-base font-semibold text-slate-900'>{value}</p>
              </div>
            )
          })}
        </div>
      ) : null}

      {notes.length ? (
        <ul className='list-disc space-y-1 pl-5 text-sm text-slate-700'>
          {notes.map((note, index) => (
            <li key={`${index}-${String(note)}`}>{formatCell(note as JsonValue)}</li>
          ))}
        </ul>
      ) : null}

      {table.length ? <RecordTable rows={table.filter(isRecord)} /> : null}
    </div>
  )
}

function RecordTable({ rows }: { rows: JsonObject[] }) {
  if (!rows.length) {
    return null
  }
  const allKeys = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).sort((a, b) => a.localeCompare(b))
  return (
    <div className='overflow-x-auto rounded-lg border border-slate-200'>
      <table className='min-w-full text-left text-xs'>
        <thead className='bg-slate-100 text-slate-600'>
          <tr>
            {allKeys.map(key => (
              <th className='px-3 py-2 font-semibold uppercase tracking-wide' key={key}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, rowIndex) => (
            <tr className='border-t border-slate-200' key={rowIndex}>
              {allKeys.map(key => (
                <td className='px-3 py-2 text-slate-700' key={`${rowIndex}-${key}`}>
                  {shouldBadge(key, row[key] as JsonValue) ? (
                    <ValueBadge value={String(row[key])} />
                  ) : (
                    formatCell((row[key] as JsonValue) ?? null)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderGenericObject(data: JsonObject) {
  if ('highlights' in data || 'notes' in data || 'table' in data) {
    return renderPortalMock(data)
  }
  return (
    <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
      {Object.keys(data)
        .sort((a, b) => a.localeCompare(b))
        .map(key => (
          <div className='rounded-lg border border-slate-200 bg-slate-50 p-3' key={key}>
            <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>{key}</p>
            <div className='mt-1 text-sm text-slate-800'>
              {shouldBadge(key, data[key] as JsonValue) ? (
                <ValueBadge value={String(data[key])} />
              ) : (
                formatCell(data[key] as JsonValue)
              )}
            </div>
          </div>
        ))}
    </div>
  )
}

function renderData(data: JsonValue | null) {
  if (data === null) {
    return <p className='text-sm text-slate-500'>No data returned.</p>
  }
  if (Array.isArray(data)) {
    return <RecordTable rows={data.filter(isRecord)} />
  }
  if (isRecord(data)) {
    return renderGenericObject(data)
  }
  return <p className='text-sm font-medium text-slate-700'>{formatCell(data)}</p>
}

export default function EndpointPreview({ label, path }: { label: string; path: string }) {
  const [data, setData] = useState<JsonValue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const payload = await apiGet<JsonValue>(path, controller.signal)
        setData(payload)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          const message = loadError instanceof Error ? loadError.message : 'Unknown fetch error'
          setError(message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => controller.abort()
  }, [path])

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4'>
      <div className='mb-2'>
        <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{label}</p>
        <p className='text-xs text-slate-400'>{path}</p>
      </div>
      {loading ? <p className='text-sm text-slate-500'>Loading endpoint data...</p> : null}
      {error ? <p className='text-sm text-red-600'>Request failed: {error}</p> : null}
      {!loading && !error ? <div className='space-y-3'>{renderData(data)}</div> : null}
      {!loading && !error ? (
        <details className='mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2'>
          <summary className='cursor-pointer text-xs font-semibold text-slate-500'>Raw JSON</summary>
          <pre className='mt-2 max-h-64 overflow-auto text-xs text-slate-700'>{JSON.stringify(data, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}
