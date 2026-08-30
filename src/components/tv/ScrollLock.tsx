'use client'

import { useEffect } from 'react'

/**
 * Suppresses the underlying page scrollbar while a `/tv/*` route is
 * mounted. The root layout (owned by another agent) renders a normal
 * scrollable body with header/footer; this display fully covers that with
 * a fixed, high z-index overlay, but the document itself could still be
 * scrollable behind it on very small viewports. Restores the previous
 * overflow style on unmount so navigating back to the rest of the site is
 * unaffected.
 */
export function ScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return null
}
