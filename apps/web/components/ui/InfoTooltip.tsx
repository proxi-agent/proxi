import { Info } from 'lucide-react'

interface InfoTooltipProps {
  text: string
  placement?: 'bottom' | 'top'
}

export default function InfoTooltip({ text, placement = 'top' }: InfoTooltipProps) {
  const bubblePositionClass = placement === 'bottom' ? 'top-[calc(100%+0.45rem)]' : 'bottom-[calc(100%+0.45rem)]'

  return (
    <span className='group relative inline-flex cursor-help align-middle' tabIndex={0}>
      <Info className='text-blue-500' size={12} strokeWidth={2.2} />
      <span
        className={`pointer-events-none invisible absolute left-1/2 z-20 w-max max-w-[280px] -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[0.72rem] text-slate-50 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${bubblePositionClass}`}
        role='tooltip'
      >
        {text}
      </span>
    </span>
  )
}
