import type { CSSProperties } from 'react'

export function Skeleton({
  className = '',
  height,
  rounded = 'md',
  style,
  width,
}: {
  className?: string
  height?: number | string
  rounded?: 'full' | 'lg' | 'md' | 'sm'
  style?: CSSProperties
  width?: number | string
}) {
  const radiusClass = rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : rounded === 'sm' ? 'rounded-sm' : 'rounded-md'
  return (
    <span
      aria-hidden
      className={`skeleton block ${radiusClass} ${className}`}
      style={{
        height: typeof height === 'number' ? `${height}px` : (height ?? '1em'),
        width: typeof width === 'number' ? `${width}px` : (width ?? '100%'),
        ...style,
      }}
    />
  )
}

/** Reusable skeleton loader for tables. */
export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div aria-busy aria-label='Loading' className='w-full' role='status'>
      <div className='flex gap-3 border-b border-line px-4 py-3'>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton height={12} key={i} width={i === 0 ? 120 : 80} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div className='flex gap-3 border-b border-line px-4 py-4' key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton height={10} key={c} width={c === 0 ? 140 : c === columns - 1 ? 60 : 100} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Card-level skeleton — use inside a Panel. */
export function BlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy aria-label='Loading' className='flex flex-col gap-2' role='status'>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton height={10} key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}
