interface PageHeaderProps {
  eyebrow: string
  metric: string
  title: string
}

export default function PageHeader({ eyebrow, metric, title }: PageHeaderProps) {
  return (
    <section className='mb-4 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center'>
      <div>
        <p className='text-xs font-bold uppercase tracking-[0.08em] text-blue-300'>{eyebrow}</p>
        <h2 className='text-2xl font-semibold text-slate-900'>{title}</h2>
      </div>
      <p className='text-sm text-slate-500'>{metric}</p>
    </section>
  )
}
