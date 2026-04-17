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
        <div className='assistant-avatar'>Px</div>
        <div className='flex flex-col leading-tight'>
          <span className='assistant-title'>{title}</span>
          <span className='assistant-sub'>{subtitle}</span>
        </div>
        <div className='ml-auto flex items-center gap-1 text-[11px] text-[color:var(--color-ink-500)]'>
          <span className='h-1.5 w-1.5 rounded-full bg-[color:var(--color-positive-500)]' />
          Online
        </div>
      </div>

      <div className='assistant-messages'>
        {messages.map((m, i) => (
          <div
            className={m.author === 'assistant' ? 'bubble-assistant' : 'bubble-user'}
            key={i}
          >
            <div>{m.body}</div>
            {m.meta && (
              <div
                className={`mt-1.5 text-[11px] ${
                  m.author === 'assistant'
                    ? 'text-[color:var(--color-brand-700)]/80'
                    : 'text-white/70'
                }`}
              >
                {m.meta}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className='quick-actions'>
        {quickActions.map((q) => (
          <button className='quick-action' key={q} type='button'>
            {q}
          </button>
        ))}
      </div>

      <div className='assistant-input'>
        <Icon name='sparkles' size={15} />
        <input placeholder='Ask Proxi anything · e.g. "Transfer 250 shares to my brokerage"' />
        <button className='btn btn-brand btn-sm' type='button'>
          <Icon name='send' size={13} />
          Send
        </button>
      </div>

      {footerNote && (
        <div className='border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-2 text-[11px] text-[color:var(--color-ink-500)]'>
          {footerNote}
        </div>
      )}
    </div>
  )
}
