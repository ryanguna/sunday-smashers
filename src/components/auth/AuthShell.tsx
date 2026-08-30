import type { ReactNode } from 'react'
import { Card, CardBody, Snowfall } from '@/components/ui'
import { SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

export interface AuthShellProps {
  icon?: ReactNode
  eyebrow?: string
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Shared festive card wrapper for every auth screen (login, signup, forgot/
 * reset password, onboarding, 403). Keeps the "warm Christmas + badminton"
 * feel consistent without every page re-implementing the chrome.
 */
export function AuthShell({ icon, eyebrow, title, subtitle, children, footer, className }: AuthShellProps) {
  return (
    <main className="relative flex min-h-[85dvh] items-center justify-center overflow-hidden px-4 py-16">
      <Snowfall />
      <div className="relative z-10 w-full max-w-md">
        <Card variant="frosted" className={cn('border-candy-stripe', className)}>
          <CardBody className="p-2 sm:p-3">
            <div className="mb-6 text-center">
              <span
                aria-hidden="true"
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]"
              >
                {icon ?? <SnowflakeIcon size={28} />}
              </span>
              {eyebrow && (
                <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
                  {eyebrow}
                </p>
              )}
              <h1 className="mt-1 text-3xl font-extrabold text-[var(--color-plum)]">{title}</h1>
              {subtitle && <p className="mt-2 text-[var(--color-ink-soft)]">{subtitle}</p>}
            </div>
            {children}
            {footer && (
              <div className="mt-6 border-t border-black/5 pt-5 text-center text-sm text-[var(--color-ink-soft)]">
                {footer}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
