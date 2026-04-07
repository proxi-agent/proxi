import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <section
      className={`mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(23,31,56,0.08)] ${className}`.trim()}
    >
      {children}
    </section>
  )
}
