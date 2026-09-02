'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  /**
   * `createPortal` needs a real `document`, absent during the server render.
   * A modal always opens in response to a client interaction, so gating on
   * mount costs nothing.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // Scroll lock + focus trap + Escape-to-close
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const node = dialogRef.current
    const focusables = node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
    ;(focusables[0] ?? node)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab' && node) {
        const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  /**
   * Rendered into `document.body`, never in place.
   *
   * A `position: fixed` element is measured against the viewport only while no
   * ancestor creates a containing block for it — and `backdrop-filter`,
   * `filter` and `transform` all do. The site header hit exactly this: its
   * `backdrop-filter` trapped the mobile menu, which then opened *behind* the
   * page on iOS. `Modal` is used in fourteen places and any one of them could
   * later be moved inside a blurred card, so this is closed off at the source
   * rather than audited per call site.
   *
   * This cannot be caught by our tests: headless Chromium reports
   * `backdrop-filter: none` because it needs GPU compositing, so the failure
   * only ever appears on a real phone. Portalling makes it impossible instead.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-[var(--color-plum)]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-modal-title"
        aria-describedby={description ? 'ss-modal-description' : undefined}
        tabIndex={-1}
        className={cn(
          // Cap the height and let only the body scroll, so a tall dialog keeps
          // its title and close button pinned and can never push its own save
          // button off-screen inside an unscrollable fixed container.
          'relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-[var(--radius-xl)] bg-white shadow-[var(--shadow-lift)] animate-pop-in outline-none',
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
          <h2 id="ss-modal-title" className="text-xl font-bold text-[var(--color-plum)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {description && (
          <p id="ss-modal-description" className="shrink-0 px-6 pb-4 text-[var(--color-ink-soft)]">
            {description}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}
