'use client'

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main className='mx-auto max-w-xl px-6 py-16'>
      <h1 className='text-2xl font-semibold text-slate-900'>Create account</h1>
      <p className='mt-2 text-sm text-slate-600'>Sign up with Clerk to access the Proxi role-based portals.</p>
      <div className='mt-6'>
        <SignUp
          appearance={{
            elements: {
              card: 'shadow-sm',
            },
          }}
          forceRedirectUrl='/'
          routing='hash'
          signInUrl='/login'
        />
      </div>
    </main>
  )
}
