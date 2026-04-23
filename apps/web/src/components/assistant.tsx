import { Icon } from '@/components/icon'

export type AssistantMessage = {
  author: 'assistant' | 'user'
  body: string
  meta?: string
}

export function ProxiAssistant({
  footerNote,
  messages,
  quickActions,
  subtitle = 'High-trust transfer assistant · Always cites sources',
  title = 'Proxi Assistant',
}: {
  footerNote?: string
  messages: AssistantMessage[]
  quickActions: string[]
  subtitle?: string
  title?: string
}) {
  return (
    <div className='assistant'>
      <div className='assistant-head'>
        <div className='assistant-avatar'>
          <Icon name='sparkles' size={14} />
        </div>
        <div className='flex min-w-0 flex-col leading-tight'>
          <span className='assistant-title'>{title}</span>
          <span className='assistant-sub truncate'>{subtitle}</span>
        </div>
        <div className='ml-auto flex items-center gap-1.5 text-[11px] font-medium text-ink-500'>
          <span className='pulse-dot' />
          Online
        </div>
      </div>

      <div className='assistant-messages'>
        {messages.map((m, i) => (
          <div className={m.author === 'assistant' ? 'bubble-assistant' : 'bubble-user'} key={i}>
            <div>{m.body}</div>
            {m.meta && (
              <div className={`mt-1.5 text-[11px] ${m.author === 'assistant' ? 'text-brand-700/80' : 'text-white/70'}`}>{m.meta}</div>
            )}
          </div>
        ))}
      </div>

      <div className='quick-actions'>
        {quickActions.map(q => (
          <button className='quick-action' key={q} type='button'>
            {q}
          </button>
        ))}
      </div>

      <div className='assistant-input'>
        <Icon className='text-brand-700' name='sparkles' size={15} />
        <input placeholder='Ask Proxi anything · e.g. “Transfer 250 shares to my brokerage”' />
        <button aria-label='Send' className='btn btn-brand btn-sm btn-icon' type='button'>
          <Icon name='send' size={13} />
        </button>
      </div>

      {footerNote && (
        <div className='flex items-center gap-1.5 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-500'>
          <Icon className='text-ink-400' name='shield-check' size={11} />
          {footerNote}
        </div>
      )}
    </div>
  )
}
