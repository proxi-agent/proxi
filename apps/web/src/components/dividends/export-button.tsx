'use client'

import { Icon } from '@/components/icon'
import { type DividendExportLocation, triggerDownload } from '@/lib/dividends/api'

/**
 * Reusable client-side download button for dividend CSV exports.
 *
 * Server pages compute the export URL via `exportUrl(...)` (which accepts
 * the same filter shape used elsewhere in `lib/dividends/api.ts`) and
 * pass it down here. The button hands off to the browser's download
 * pipeline by clicking a temporary `<a download>` anchor — no fetch
 * round-trip is needed, the server already sets the right
 * `Content-Disposition` header.
 *
 * `variant` follows the existing button-system conventions
 * (`secondary` for default toolbar buttons, `ghost` for inline
 * placement next to other actions).
 */
export function ExportButton({
  className,
  iconSize = 12,
  label,
  location,
  size = 'sm',
  title,
  variant = 'secondary',
}: {
  className?: string
  iconSize?: number
  label: string
  location: DividendExportLocation
  size?: 'sm' | 'md' | 'lg'
  title?: string
  variant?: 'brand' | 'ghost' | 'secondary'
}) {
  return (
    <button
      className={['btn', `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(' ')}
      onClick={() => triggerDownload(location)}
      title={title ?? label}
      type='button'
    >
      <Icon name='download' size={iconSize} />
      {label}
    </button>
  )
}
