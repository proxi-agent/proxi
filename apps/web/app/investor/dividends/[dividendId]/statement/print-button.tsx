'use client'

import { Icon } from '@/components/icon'

export function PrintButton() {
  return (
    <button
      className='btn btn-brand btn-sm'
      onClick={() => {
        if (typeof window !== 'undefined') window.print()
      }}
      type='button'
    >
      <Icon name='download' size={13} />
      Print / save PDF
    </button>
  )
}
