'use client'

import { useEffect, useMemo, useState } from 'react'

function computeParts(diffMs: number) {
  const abs = Math.abs(diffMs)
  const hours = Math.floor(abs / (1000 * 60 * 60))
  const minutes = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

export function SlaCountdown({ compact, dueAt, paused }: { compact?: boolean; dueAt: string; paused?: boolean }) {
  const dueMs = useMemo(() => new Date(dueAt).getTime(), [dueAt])
  const [now, setNow] = useState<number>(() => dueMs)

  // Only update the client-side clock after mount to avoid SSR mismatch
  useEffect(() => {
    setNow(Date.now())
    if (paused) return
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [paused])

  const diff = dueMs - now
  const overdue = diff < 0
  const { hours, minutes } = computeParts(diff)

  let label: string
  if (paused) label = 'paused'
  else if (overdue) label = `${hours > 0 ? `${hours}h ` : ''}${minutes}m overdue`
  else if (hours === 0) label = `due in ${Math.max(1, minutes)}m`
  else label = `due in ${hours}h ${minutes}m`

  const tone = paused ? 'text-ink-500' : overdue ? 'text-danger-700' : hours < 2 ? 'text-warning-700' : 'text-ink-800'

  if (compact) return <span className={`num text-[12px] font-semibold ${tone}`}>{label}</span>

  return <span className={`num text-[13px] font-semibold ${tone}`}>{label}</span>
}
