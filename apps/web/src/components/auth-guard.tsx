'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { canAccessPortal, defaultPortalPathForRole } from '@/lib/auth/rbac'

export default function AuthGuard({ children, portal }: { children: ReactNode; portal: 'agent' | 'issuer' | 'shareholder' }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`)
      return
    }
    if (!canAccessPortal(user, portal)) {
      router.replace(defaultPortalPathForRole(user.role))
    }
  }, [pathname, portal, router, user])

  if (!user || !canAccessPortal(user, portal)) {
    return <p className='p-6 text-sm text-slate-500'>Checking access...</p>
  }

  return <>{children}</>
}
