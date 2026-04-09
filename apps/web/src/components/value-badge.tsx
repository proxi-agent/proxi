type BadgeTone = 'danger' | 'info' | 'muted' | 'success' | 'warning'

function classify(value: string): BadgeTone {
  const normalized = value.toLowerCase()
  if (normalized.includes('critical') || normalized.includes('failed') || normalized.includes('high') || normalized.includes('rejected')) {
    return 'danger'
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('medium') || normalized.includes('open')) {
    return 'warning'
  }
  if (normalized.includes('completed') || normalized.includes('resolved') || normalized.includes('approved') || normalized.includes('low') || normalized.includes('ok')) {
    return 'success'
  }
  if (normalized.includes('info')) {
    return 'info'
  }
  return 'muted'
}

const toneClasses: Record<BadgeTone, string> = {
  danger: 'bg-red-50 border-red-200 text-red-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
  muted: 'bg-slate-50 border-slate-200 text-slate-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
}

export default function ValueBadge({ value }: { value: string }) {
  const tone = classify(value)
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>{value}</span>
}
