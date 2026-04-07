interface AlertBannerProps {
  message: string
  variant: 'error' | 'success'
}

export default function AlertBanner({ message, variant }: AlertBannerProps) {
  if (!message) {
    return null
  }

  const classes =
    variant === 'error'
      ? 'mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
      : 'mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'

  return <div className={classes}>{message}</div>
}
