import { Button, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'

export default function NotFound() {
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
          Out of bounds!
        </p>
        <h1 className="mt-1 text-4xl font-extrabold text-[var(--color-plum)] sm:text-5xl">
          404 — that shuttle landed nowhere
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[var(--color-ink-soft)]">
          This page hasn&apos;t been served up yet. Head back to home court, or check the rules
          while you wait.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/">Back to Home</Button>
          <Button href="/rules" variant="secondary">
            Read the rules
          </Button>
        </div>
      </div>
    </main>
  )
}
