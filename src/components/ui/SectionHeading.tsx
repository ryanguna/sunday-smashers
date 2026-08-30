import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SnowflakeIcon } from '@/components/icons'

export interface SectionHeadingProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  /**
   * Heading level. Defaults to 2 because most uses are a section inside a page,
   * but the *page title* must be level 1: a page whose headings start at h2
   * gives screen-reader users navigating by heading nothing to land on, and
   * leaves search engines with no primary heading. Appearance is identical at
   * every level — this changes semantics only.
   */
  level?: 1 | 2 | 3
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  level = 2,
  className,
}: SectionHeadingProps) {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3'

  return (
    <div className={cn(align === 'center' ? 'text-center' : 'text-left', className)}>
      {eyebrow && (
        <p className="mb-1 font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
          {eyebrow}
        </p>
      )}
      <Heading className="text-3xl font-extrabold text-[var(--color-plum)] sm:text-4xl">
        {title}
      </Heading>
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
