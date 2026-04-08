import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className='mx-auto max-w-3xl px-6 py-16'>
      <h1 className='text-3xl font-semibold text-slate-900'>Proxi Transfer Portals</h1>
      <p className='mt-3 text-slate-600'>Access shareholder, issuer, and agent workflows from a single role-based app.</p>
      <div className='mt-6 flex gap-3'>
        <Link className='rounded-md bg-blue-700 px-4 py-2 text-white' href='/login'>
          Sign in
        </Link>
        <Link className='rounded-md border border-slate-300 px-4 py-2 text-slate-700' href='/forgot-password'>
          Forgot password
        </Link>
      </div>
    </main>
  )
}
