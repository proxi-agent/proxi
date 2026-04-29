import { Badge } from '@/components/ui'
import {
  BATCH_STATUS_LABEL,
  BATCH_STATUS_TONE,
  DIVIDEND_STATUS_LABEL,
  DIVIDEND_STATUS_TONE,
  ENTITLEMENT_STATUS_LABEL,
  ENTITLEMENT_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  TAX_FORM_LABEL,
  TAX_FORM_TONE,
} from '@/lib/dividends/copy'
import type { DividendStatus, EntitlementPaymentStatus, PaymentBatchStatus, PaymentStatus, TaxFormStatus } from '@/lib/dividends/types'

const STATUS_ICON: Record<DividendStatus, string> = {
  APPROVED: 'check-circle',
  ARCHIVED: 'lock',
  CALCULATED: 'sparkles',
  CANCELLED: 'x-circle',
  CHANGES_REQUESTED: 'message-square',
  DRAFT: 'pencil',
  ELIGIBILITY_LOCKED: 'shield-check',
  PAID: 'check-circle',
  PARTIALLY_PAID: 'clock',
  PAYMENT_SCHEDULED: 'calendar-clock',
  PENDING_APPROVAL: 'clock',
  RECONCILED: 'badge-check',
  REJECTED: 'x-circle',
}

export function DividendStatusBadge({ status }: { status: DividendStatus }) {
  return (
    <Badge icon={STATUS_ICON[status]} tone={DIVIDEND_STATUS_TONE[status]}>
      {DIVIDEND_STATUS_LABEL[status]}
    </Badge>
  )
}

export function PaymentBatchStatusBadge({ status }: { status: PaymentBatchStatus }) {
  return <Badge tone={BATCH_STATUS_TONE[status]}>{BATCH_STATUS_LABEL[status]}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
}

export function EntitlementStatusBadge({ status }: { status: EntitlementPaymentStatus }) {
  return <Badge tone={ENTITLEMENT_STATUS_TONE[status]}>{ENTITLEMENT_STATUS_LABEL[status]}</Badge>
}

export function TaxFormBadge({ status }: { status: TaxFormStatus }) {
  return <Badge tone={TAX_FORM_TONE[status]}>{TAX_FORM_LABEL[status]}</Badge>
}
