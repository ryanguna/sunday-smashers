'use client'

import { cn } from '@/lib/cn'
import { RacketIcon } from '@/components/icons'

export interface DivisionSwitcherOption {
  id: string
  name: string
  /** Small note under the name, e.g. "11 pairs · published". */
  hint?: string
}

/**
 * Pill switcher between divisions. A real tablist (arrow keys work) rather
 * than a row of links, because the workbench keeps unsaved preview state.
 */
export function DivisionSwitcher({
  options,
  activeId,
  onChange,
}: {
  options: DivisionSwitcherOption[]
  activeId: string
  onChange: (id: string) => void
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = options[(index + delta + options.length) % options.length]
    onChange(next.id)
  }

  return (
    <div
      role="tablist"
      aria-label="Division"
      className="mb-4 flex flex-wrap gap-2 rounded-[var(--radius-lg)] bg-white/70 p-1.5 shadow-[var(--shadow-soft)]"
    >
      {options.map((option, index) => {
        const active = option.id === activeId
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2.5 text-left transition-transform duration-150 ease-[var(--ease-bounce)] active:scale-[0.98]',
              active
                ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                : 'text-[var(--color-plum)] hover:bg-[var(--color-brand-lilac-light)]/50'
            )}
          >
            <RacketIcon size={20} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-heading)] font-bold">
                {option.name}
              </span>
              {option.hint && (
                <span
                  className={cn(
                    'block truncate text-xs',
                    active ? 'text-white/85' : 'text-[var(--color-ink-muted)]'
                  )}
                >
                  {option.hint}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
