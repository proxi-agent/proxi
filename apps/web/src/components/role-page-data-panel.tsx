'use client'

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

import EndpointPreview from '@/components/endpoint-preview'
import { getEndpointsForPath } from '@/lib/page-endpoints'

export default function RolePageDataPanel() {
  const pathname = usePathname() || '/'
  const endpoints = useMemo(() => getEndpointsForPath(pathname), [pathname])

  return (
    <section className='mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4'>
      <div className='mb-3'>
        <p className='text-xs font-semibold uppercase tracking-wide text-blue-700'>Live API placeholders</p>
        <p className='text-sm text-slate-600'>These panels call real API endpoints and render endpoint-backed mock data for this page.</p>
      </div>
      <div className='grid grid-cols-1 gap-3 xl:grid-cols-2'>
        {endpoints.map(endpoint => (
          <EndpointPreview key={`${pathname}-${endpoint.path}`} label={endpoint.label} path={endpoint.path} />
        ))}
      </div>
    </section>
  )
}
