import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SnowflakeIcon } from '@/components/icons'

export interface SectionHeadingProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' ? 'text-center' : 'text-left', className)}>
      {eyebrow && (
        <p className="mb-1 font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-extrabold text-[var(--color-plum)] sm:text-4xl">{title}</h2>
      <div
        className={cn(
          'mt-3 flex items-center gap-2 text-[var(--color-brand-lilac)]',
          align === 'center' && 'justify-center'
        )}
        aria-hidden="true"
      >
        <span className="h-px w-10 bg-current opacity-50" />
        <SnowflakeIcon size={18} />
        <span className="h-px w-10 bg-current opacity-50" />
      </div>
      {description && (
        <p
          className={cn(
            'mt-3 text-[var(--color-ink-soft)]',
            align === 'center' && 'mx-auto max-w-2xl'
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}
