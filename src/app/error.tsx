'use client'

import { useEffect } from 'react'
import { Button, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="relative flex min-h-[70dvh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
      <Snowfall />
      <div className="relative z-10">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-16 w-16 animate-bob items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]"
        >
          <ShuttlecockIcon size={32} />
        </span>
        <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
          Let — replay the rally!
        </p>
        <h1 className="mt-1 text-4xl font-extrabold text-[var(--color-plum)] sm:text-5xl">
          That rally didn&apos;t go to plan
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[var(--color-ink-soft)]">
          Something went wrong on our side of the net. Give it another serve — and if it keeps
          happening, grab someone from the committee.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Serve again</Button>
          <Button href="/" variant="secondary">
            Back to Home
          </Button>
        </div>
      </div>
    </main>
  )
}
