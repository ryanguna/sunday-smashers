import Link from 'next/link'
import { EmptyState, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'

/** Shown when a handle in the URL matches nobody in the directory. */
export default function PlayerNotFound() {
  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />
      <div className="relative z-10 mx-auto max-w-2xl px-4 pt-20 sm:px-6">
        <EmptyState
          icon={<ShuttlecockIcon size={30} />}
          title="No such Smasher under this tree"
          description="We couldn't find a player with that name. They may not be entered this year, or the link has a typo in it."
          action={
            <Link
              href="/players"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[image:var(--gradient-candy)] px-5 py-2.5 font-[family-name:var(--font-heading)] font-extrabold text-white shadow-[var(--shadow-glow-pink)]"
            >
              Browse every pair 🎄
            </Link>
          }
        />
      </div>
    </main>
  )
}
