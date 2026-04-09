'use client'

import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

import { useAuth } from '@/lib/auth/auth-context'
import { defaultPortalPathForRole } from '@/lib/auth/rbac'

export default function LoginPage() {
  const { isLoaded, logout, user } = useAuth()

  if (isLoaded && user) {
    const portalPath = defaultPortalPathForRole(user.role)
    return (
      <main className='mx-auto max-w-xl px-6 py-16'>
        <h1 className='text-2xl font-semibold text-slate-900'>Already signed in</h1>
        <p className='mt-2 text-sm text-slate-600'>You are currently signed in as {user.email}. Continue to your portal or sign out.</p>
        <div className='mt-6 flex flex-wrap items-center gap-3'>
          <Link className='rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800' href={portalPath}>
            Continue to portal
          </Link>
          <button
            className='rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
            onClick={() => void logout()}
            type='button'
          >
            Sign out
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className='mx-auto max-w-xl px-6 py-16'>
      <h1 className='text-2xl font-semibold text-slate-900'>Sign in</h1>
      <p className='mt-2 text-sm text-slate-600'>Sign in with Clerk, then use the role switcher in-app to choose your operating role.</p>
      <div className='mt-6'>
        <SignIn
          appearance={{
            elements: {
              card: 'shadow-sm',
            },
          }}
          forceRedirectUrl='/'
          routing='hash'
          signUpUrl='/sign-up'
        />
      </div>
    </main>
  )
}
