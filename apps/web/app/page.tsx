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
    blurb:
      'Risk review, audit oversight, policy visibility, and tenant controls across every issuer on the platform.',
    highlights: [
      'Platform-wide risk signals',
      'Policy & rules registry',
      'Full audit surface',
    ],
    href: '/admin',
    role: 'Compliance & risk',
    tone: 'accent',
  },
  agent: {
    blurb:
      'The operations workbench: triage the queue, review AI-extracted evidence, approve exceptions, and post to ledger.',
    highlights: [
      'Queue & review center',
      'Low-confidence exception handling',
      'Immutable case audit',
    ],
    href: '/agent',
    role: 'Transfer agent teams',
    tone: 'brand',
  },
  investor: {
    blurb:
      'For registered shareholders: holdings, transfers, dividends, proxy voting, and a guided Proxi assistant.',
    highlights: [
      'Lot-level cost basis',
      'Guided transfer intake',
      'Statements & tax forms',
    ],
    href: '/investor',
    role: 'Registered shareholders',
    tone: 'info',
  },
  issuer: {
    blurb:
      'For corporate secretaries and finance teams: shareholder analytics, dividend runs, proxy, and corporate actions.',
    highlights: [
      'Ledger-of-record per company',
      'Dividend & proxy workflows',
      'Communications & reporting',
    ],
    href: '/issuer',
    role: 'Issuer finance & legal',
    tone: 'violet',
  },
}

export default function Landing() {
  return (
    <main className='min-h-screen bg-[color:var(--color-bg)]'>
      <div className='mx-auto w-full max-w-[1180px] px-8 py-16'>
        <header className='mb-12 flex items-start justify-between gap-8'>
          <div>
            <div className='mb-5 flex items-center gap-3'>
              <div className='nav-brand-mark' style={{ height: 32, width: 32 }}>
                Px
              </div>
              <div className='flex flex-col leading-tight'>
                <span className='text-[16px] font-semibold text-[color:var(--color-ink-900)]'>
                  Proxi
                </span>
                <span className='text-[11.5px] uppercase tracking-[0.08em] text-[color:var(--color-ink-500)]'>
                  Modern transfer agency
                </span>
              </div>
            </div>
            <h1 className='max-w-2xl text-[40px] font-semibold leading-[1.1] tracking-[-0.03em] text-[color:var(--color-ink-900)]'>
              Regulated shareholder infrastructure,
              <span className='text-[color:var(--color-brand-700)]'>
                {' '}
                rebuilt software-first.
              </span>
            </h1>
            <p className='mt-4 max-w-xl text-[14px] text-[color:var(--color-ink-600)]'>
              Auditable, immutable, AI-guided workflows for transfers,
              issuance, dividends, proxy voting, and corporate actions. Humans
              in the loop where it matters.
            </p>
          </div>
          <div className='flex flex-col items-end gap-2 text-[12px] text-[color:var(--color-ink-500)]'>
            <div className='flex items-center gap-2'>
              <span className='h-2 w-2 rounded-full bg-[color:var(--color-positive-500)]' />
              All systems operational
            </div>
            <span>v1 · Demo tenant: Meridian Optics, Inc.</span>
          </div>
        </header>

        <section className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          {PORTAL_ORDER.map((id) => {
            const portal = portalCopy[id]
            const meta = PORTAL_META[id]
            return (
              <Link
                className='group relative flex flex-col rounded-[14px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-xs)] transition hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-md)]'
                href={portal.href}
                key={id}
              >
                <div className='flex items-center gap-2'>
                  <span className={`portal-dot ${id}`} />
                  <span className='text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-500)]'>
                    {portal.role}
                  </span>
                </div>
                <div className='mt-3 flex items-center justify-between gap-2'>
                  <h2 className='text-[20px] font-semibold text-[color:var(--color-ink-900)]'>
                    {meta.name}
                  </h2>
                  <span className='flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--color-line)] text-[color:var(--color-ink-500)] transition group-hover:border-[color:var(--color-ink-900)] group-hover:bg-[color:var(--color-ink-900)] group-hover:text-white'>
                    <Icon name='arrow-right' size={14} />
                  </span>
                </div>
                <p className='mt-2 text-[13.5px] text-[color:var(--color-ink-600)]'>
                  {portal.blurb}
                </p>
                <ul className='mt-5 flex flex-col gap-1.5 border-t border-[color:var(--color-line)] pt-4 text-[13px] text-[color:var(--color-ink-700)]'>
                  {portal.highlights.map((h) => (
                    <li className='flex items-center gap-2' key={h}>
                      <Icon
                        className='text-[color:var(--color-brand-700)]'
                        name='check'
                        size={14}
                      />
                      {h}
                    </li>
                  ))}
                </ul>
              </Link>
            )
          })}
        </section>

        <footer className='mt-12 flex items-center justify-between text-[12px] text-[color:var(--color-ink-500)]'>
          <span>© 2026 Proxi Transfer Agency, Inc. · All activity is audited.</span>
          <div className='flex items-center gap-4'>
            <span>SOC 2 Type II</span>
            <span>SEC Rule 17Ad-17</span>
            <span>FINRA partner</span>
          </div>
        </footer>
      </div>
    </main>
  )
}
