import type { Metadata } from 'next'
import { Button, Snowfall } from '@/components/ui'
import { HollyIcon } from '@/components/icons'

export const metadata: Metadata = {
  title: 'No entry',
}

export default function ForbiddenPage() {
  return (
    <main className="relative flex min-h-[70dvh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <Snowfall />
      <div className="relative z-10">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-[var(--color-plum)] shadow-[var(--shadow-glow-mint)]"
        >
          <HollyIcon size={32} />
        </span>
        <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
          Naughty list
        </p>
        <h1 className="mt-1 text-4xl font-extrabold text-[var(--color-plum)] sm:text-5xl">
          403 — this court&apos;s reserved
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[var(--color-ink-soft)]">
          You&apos;re signed in, but this area needs a different role — umpire, tabulator or
          organiser access. If that should be you, ask a tournament admin to grant it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/dashboard">Back to my dashboard</Button>
          <Button href="/" variant="secondary">
            Home court
          </Button>
        </div>
      </div>
    </main>
  )
}
