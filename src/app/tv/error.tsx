'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShuttlecockIcon } from '@/components/icons'

/**
 * The courtside monitor runs unattended for hours. Without this boundary a
 * render throw fell through to the site-wide error page: light theme, site
 * chrome, and a "Try again" button that nobody is standing next to.
 *
 * So this one retries itself. If the cause is transient — a dropped Realtime
 * socket, a bad payload for one match — the screen heals on its own. If it is
 * permanent the retry loops every few seconds forever, which is the right
 * behaviour for a display with no operator: a screen that keeps trying is
 * strictly better than a dead one, and the countdown tells anyone walking past
 * what it is doing.
 */
const RETRY_SECONDS = 8

export default function TvError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(RETRY_SECONDS)

  useEffect(() => {
    console.error(error)
  }, [error])

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (secondsLeft > 0) return
    reset()
  }, [secondsLeft, reset])

  const retryNow = useCallback(() => reset(), [reset])

  return (
    // The whole screen is the retry target: no small tap goal to find on a
    // monitor, and it costs nothing on a display nobody touches.
    <button
      type="button"
      onClick={retryNow}
      aria-live="polite"
      className="flex h-full w-full cursor-default flex-col items-center justify-center gap-[2vh] bg-[#1c0f2e] px-[4vw] text-center text-white"
    >
      <ShuttlecockIcon className="animate-bob h-[10vh] w-[10vh] text-[var(--color-brand-gold)]" />
      <p className="text-[3.2vh] font-semibold text-white/70">
        The scoreboard tripped over itself
      </p>
      <p className="text-[5vh] font-extrabold leading-tight">
        Picking the shuttle back up…
      </p>
      <p className="text-[2.6vh] text-white/60">
        {secondsLeft > 0
          ? `Retrying in ${secondsLeft}s — or tap anywhere to retry now`
          : 'Retrying now…'}
      </p>
    </button>
  )
}
