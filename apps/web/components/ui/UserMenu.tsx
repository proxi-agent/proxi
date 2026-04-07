import { useMemo, useState } from 'react'

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false)

  const user = useMemo(
    () => ({
      email: process.env.NEXT_PUBLIC_USER_EMAIL || 'operator@proxi.local',
      name: process.env.NEXT_PUBLIC_USER_NAME || 'Transfer Operator',
      role: process.env.NEXT_PUBLIC_USER_ROLE || 'Operations Analyst',
    }),
    [],
  )

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <div className='relative'>
      <button
        className='flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5'
        onClick={() => setIsOpen(previous => !previous)}
        type='button'
      >
        <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-blue-600 to-blue-900 text-xs font-bold text-white'>
          {initials || 'OP'}
        </span>
        <span className='flex flex-col text-left text-slate-900'>
          <strong className='text-xs leading-none'>{user.name}</strong>
          <span className='text-[0.7rem] text-slate-500'>{user.role}</span>
        </span>
      </button>
      {isOpen ? (
        <div className='absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[220px] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(23,31,56,0.08)]'>
          <p className='text-sm font-bold text-slate-900'>{user.name}</p>
          <p className='mt-1 text-xs text-slate-500'>{user.email}</p>
          <hr className='my-2 border-slate-100' />
          <button className='block w-full rounded-md px-2 py-1.5 text-left text-slate-900 hover:bg-blue-50' type='button'>
            Profile
          </button>
          <button className='block w-full rounded-md px-2 py-1.5 text-left text-slate-900 hover:bg-blue-50' type='button'>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
