'use client'

import { SignIn } from '@clerk/nextjs'

export default function LoginPage() {
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
