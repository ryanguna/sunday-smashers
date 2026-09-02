'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: ReactNode
  content: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  defaultTabId?: string
  className?: string
}

export function Tabs({ items, defaultTabId, className }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTabId ?? items[0]?.id)
  const baseId = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusTab(index: number) {
    const item = items[index]
    if (!item) return
    setActiveId(item.id)
    tabRefs.current[item.id]?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        focusTab((index + 1) % items.length)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        focusTab((index - 1 + items.length) % items.length)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(items.length - 1)
        break
      default:
        break
    }
  }

  const activeItem = items.find((item) => item.id === activeId) ?? items[0]

  return (
    // `min-w-0` on the root and the panel: both are routinely flex or grid
    // items, and such items default to `min-width: auto`, meaning they refuse
    // to shrink below their content. A tab panel holding a wide table (the
    // schedule grid is `min-w-[46rem]`) therefore stretched its whole ancestor
    // chain and scrolled the *page* sideways on a phone, instead of letting
    // the table's own `overflow-x-auto` scroll on its own.
    <div className={cn('min-w-0', className)}>
      <div
        role="tablist"
        aria-label="Tabs"
        className="flex flex-wrap gap-2 rounded-[var(--radius-pill)] bg-white/70 p-1.5 shadow-[var(--shadow-soft)]"
      >
        {items.map((item, index) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el
              }}
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors',
                selected
                  ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-brand-lilac-light)]/50'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {activeItem && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeItem.id}`}
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
          className="mt-4 min-w-0 animate-fade-in"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  )
}
