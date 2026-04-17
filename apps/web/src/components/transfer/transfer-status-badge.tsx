import { Badge } from '@/components/ui'
import { STATUS_META } from '@/lib/transfer/copy'
import type { TransferStatus } from '@/lib/transfer/types'

const ICON: Record<TransferStatus, string> = {
  'ai-review': 'sparkles',
  approved: 'check-circle',
  blocked: 'lock',
  cancelled: 'x-circle',
  draft: 'pencil',
  escalated: 'alert-triangle',
  failed: 'x',
  'in-review': 'scan-search',
  'needs-info': 'help-circle',
  posted: 'check-circle',
  ready: 'circle-dot',
  rejected: 'x',
  submitted: 'upload',
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge icon={ICON[status]} tone={meta.tone}>
      {meta.label}
    </Badge>
  )
}
