import InfoTooltip from './InfoTooltip'

interface MetricItem {
  label: string
  value: number
}

interface MetricChartProps {
  items: MetricItem[]
  tooltipText?: string
  title: string
}

export default function MetricChart({ items, title, tooltipText }: MetricChartProps) {
  const maxValue = Math.max(...items.map(item => item.value), 1)

  return (
    <section className='w-full'>
      <div className='mb-3 inline-flex items-center gap-2'>
        <h3 className='text-lg font-semibold text-slate-900'>{title}</h3>
        {tooltipText ? <InfoTooltip text={tooltipText} /> : null}
      </div>
      <div className='grid gap-3'>
        {items.map(item => (
          <div key={item.label} className='grid gap-1.5'>
            <div className='flex items-center justify-between text-sm text-slate-500'>
              <span>{item.label}</span>
              <strong className='text-slate-900'>{item.value.toLocaleString()}</strong>
            </div>
            <div className='h-2 overflow-hidden rounded-full bg-blue-100'>
              <span
                className='block h-full rounded-full bg-linear-to-br from-blue-500 to-blue-700'
                style={{
                  width: `${Math.max(7, (item.value / maxValue) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
