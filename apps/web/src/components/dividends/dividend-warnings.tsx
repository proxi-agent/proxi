import { Callout } from '@/components/callout'
import { WARNING_LABEL } from '@/lib/dividends/copy'
import type { DividendWarning } from '@/lib/dividends/types'

/** Stack of warnings, surfaced near the top of a page so they can't be missed. */
export function DividendWarnings({ warnings }: { warnings: DividendWarning[] }) {
  if (warnings.length === 0) return null
  const errors = warnings.filter(w => w.severity === 'ERROR')
  const warns = warnings.filter(w => w.severity === 'WARNING')
  const infos = warnings.filter(w => w.severity === 'INFO')
  return (
    <div className='flex flex-col gap-2'>
      {errors.length > 0 && (
        <Callout title='Action required' tone='danger'>
          <ul className='list-disc pl-4'>
            {errors.map(w => (
              <li key={w.code}>
                <span className='font-semibold'>{WARNING_LABEL[w.code] ?? w.code}</span>
                {w.detail ? ` — ${w.detail}` : ''}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {warns.length > 0 && (
        <Callout title='Review before proceeding' tone='warning'>
          <ul className='list-disc pl-4'>
            {warns.map(w => (
              <li key={w.code}>
                <span className='font-semibold'>{WARNING_LABEL[w.code] ?? w.code}</span>
                {w.detail ? ` — ${w.detail}` : ''}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {infos.length > 0 && (
        <Callout tone='info'>
          <ul className='list-disc pl-4'>
            {infos.map(w => (
              <li key={w.code}>
                <span className='font-semibold'>{WARNING_LABEL[w.code] ?? w.code}</span>
                {w.detail ? ` — ${w.detail}` : ''}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  )
}
