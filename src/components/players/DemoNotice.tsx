import { BaubleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

export interface DemoNoticeProps {
  className?: string
}

/**
 * The shared "you're looking at sample data" pill, styled to match the one
 * on the player dashboard.
 */
export function DemoNotice({ className }: DemoNoticeProps) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)] px-3 py-1 text-xs font-extrabold text-[var(--color-brand-gold-dark)]',
        className,
      )}
    >
      <BaubleIcon size={14} aria-hidden="true" />
      Demo mode — sample pairs and results from a make-believe tournament day.
    </p>
  )
}
