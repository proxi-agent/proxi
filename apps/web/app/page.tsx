import Link from 'next/link'

import { Icon } from '@/components/icon'
import { PORTAL_META, PORTAL_ORDER } from '@/lib/nav'

const portalCopy: Record<
  string,
  {
    blurb: string
    highlights: string[]
    href: string
    role: string
    tone: string
  }
> = {
  admin: {
    blurb: 'Risk review, audit oversight, policy visibility, and tenant controls across every issuer on the platform.',
    highlights: ['Platform-wide risk signals', 'Policy & rules registry', 'Full audit surface'],
    href: '/admin',
    role: 'Compliance & risk',
    tone: 'accent',
  },
  agent: {
    blurb: 'The operations workbench: triage the queue, review AI-extracted evidence, approve exceptions, and post to ledger.',
    highlights: ['Queue & review center', 'Low-confidence exception handling', 'Immutable case audit'],
    href: '/agent',
    role: 'Transfer agent teams',
    tone: 'brand',
  },
  investor: {
    blurb: 'For registered shareholders: holdings, transfers, dividends, proxy voting, and a guided Proxi assistant.',
    highlights: ['Lot-level cost basis', 'Guided transfer intake', 'Statements & tax forms'],
    href: '/investor',
    role: 'Registered shareholders',
    tone: 'info',
  },
  issuer: {
    blurb: 'For corporate secretaries and finance teams: shareholder analytics, dividend runs, proxy, and corporate actions.',
    highlights: ['Ledger-of-record per company', 'Dividend & proxy workflows', 'Communications & reporting'],
    href: '/issuer',
    role: 'Issuer finance & legal',
    tone: 'violet',
  },
}

export default function Landing() {
  return (
    <main className='relative min-h-screen bg-bg'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-x-0 top-0 h-[420px]'
        style={{
          background:
            'radial-gradient(60% 120% at 50% 0%, color-mix(in srgb, var(--color-brand-100) 55%, transparent) 0%, transparent 60%)',
        }}
      />
      <div className='relative mx-auto w-full max-w-[1180px] px-8 py-16'>
        <header className='mb-14 flex items-start justify-between gap-8'>
          <div>
            <div className='mb-6 flex items-center gap-3'>
              <div className='nav-brand-mark' style={{ borderRadius: 9, height: 34, width: 34 }}>
                Px
              </div>
              <div className='flex flex-col leading-tight'>
                <span className='text-[16px] font-semibold text-ink-900'>Proxi</span>
                <span className='text-[11px] uppercase tracking-[0.1em] text-ink-500'>Modern Transfer Agency</span>
              </div>
            </div>
            <h1 className='max-w-2xl text-[42px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink-900'>
              Regulated shareholder infrastructure,
              <span className='text-brand-700'> rebuilt software-first.</span>
            </h1>
            <p className='mt-5 max-w-xl text-[14.5px] leading-[1.6] text-ink-600'>
              Auditable, immutable, AI-guided workflows for transfers, issuance, dividends, proxy voting, and corporate actions — with
              humans in the loop where it matters.
            </p>
          </div>
          <div className='flex flex-col items-end gap-1.5 text-[12px] text-ink-500'>
            <div className='flex items-center gap-2'>
              <span className='pulse-dot' />
              <span className='font-medium text-ink-700'>All systems operational</span>
            </div>
            <span>v1 · Demo tenant · Meridian Optics, Inc.</span>
          </div>
        </header>

        <section className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          {PORTAL_ORDER.map(id => {
            const portal = portalCopy[id]
            const meta = PORTAL_META[id]
            return (
              <Link
                className='group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface p-6 shadow-xs transition duration-200 hover:-translate-y-[1px] hover:border-border-strong hover:shadow-md'
                href={portal.href}
                key={id}
              >
                <div className='flex items-center gap-2'>
                  <span className={`portal-dot ${id}`} />
                  <span className='text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500'>{portal.role}</span>
                </div>
                <div className='mt-3 flex items-center justify-between gap-2'>
                  <h2 className='text-[20px] font-semibold tracking-[-0.02em] text-ink-900'>{meta.name}</h2>
                  <span className='flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-500 transition group-hover:border-ink-900 group-hover:bg-ink-900 group-hover:text-white'>
                    <Icon name='arrow-right' size={14} />
                  </span>
                </div>
                <p className='mt-2 text-[13.5px] leading-relaxed text-ink-600'>{portal.blurb}</p>
                <ul className='mt-5 flex flex-col gap-2 border-t border-line pt-4 text-[13px] text-ink-700'>
                  {portal.highlights.map(h => (
                    <li className='flex items-center gap-2' key={h}>
                      <Icon className='text-brand-700' name='check' size={14} />
                      {h}
                    </li>
                  ))}
                </ul>
              </Link>
            )
          })}
        </section>

        <footer className='mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[12px] text-ink-500'>
          <span>© 2026 Proxi Transfer Agency, Inc. · Every action is audit-logged.</span>
          <div className='flex items-center gap-3'>
            <span className='rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-600'>SOC 2 Type II</span>
            <span className='rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-600'>SEC Rule 17Ad-17</span>
            <span className='rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-600'>FINRA partner</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
