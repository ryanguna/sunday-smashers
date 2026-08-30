import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SnowflakeIcon } from '@/components/icons'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-[var(--radius-xl)] bg-white/70 px-6 py-12 text-center shadow-[var(--shadow-soft)]',
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white">
        {icon ?? <SnowflakeIcon size={30} className="animate-twinkle [animation-duration:3s]" />}
      </div>
      <h3 className="text-xl font-bold text-[var(--color-plum)]">{title}</h3>
      {description && <p className="max-w-sm text-[var(--color-ink-soft)]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
