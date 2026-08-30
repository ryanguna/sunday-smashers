'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui'
import { ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import type { DrawTeamEntry } from '@/lib/draw-admin'

/**
 * The draw order list: drag a pair to move it, or use the ▲/▼ buttons
 * (which are also the keyboard/touch path — dragging alone would fail WCAG
 * 2.5.7 and is miserable on a phone).
 *
 * Position in this list feeds the circle-method line-up, so moving a pair
 * changes *when* it meets the other pairs, never *whether* — a single round
 * robin always has everyone playing everyone once.
 */
export function SeedingList({
  teams,
  order,
  onReorder,
  disabled = false,
}: {
  teams: Map<string, DrawTeamEntry>
  order: string[]
  onReorder: (from: number, to: number) => void
  disabled?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (disabled) return
    if (to < 0 || to >= order.length || from === to) return
    onReorder(from, to)
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {order.map((teamId, index) => {
        const team = teams.get(teamId)
        if (!team) return null
        const isDragging = dragIndex === index
        const isOver = overIndex === index && dragIndex !== null && dragIndex !== index

        return (
          <li
            key={teamId}
            draggable={!disabled}
            onDragStart={(event) => {
              setDragIndex(index)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', teamId)
            }}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
            onDragOver={(event) => {
              if (disabled || dragIndex === null) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setOverIndex(index)
            }}
            onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              if (dragIndex !== null) move(dragIndex, index)
              setDragIndex(null)
              setOverIndex(null)
            }}
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent bg-white px-2.5 py-2 shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-150',
              !disabled && 'cursor-grab active:cursor-grabbing',
              isDragging && 'opacity-60',
              isOver && 'border-[var(--color-brand-pink)] shadow-[var(--shadow-glow-pink)]'
            )}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] font-[family-name:var(--font-heading)] text-xs font-extrabold text-white tabular-nums"
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-plum)]">
                <span className="min-w-0 truncate">{team.name}</span>
                {team.seed != null && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)] px-1.5 py-0.5 text-[0.65rem] font-extrabold text-[var(--color-brand-gold-dark)]">
                    <SparkleIcon size={10} aria-hidden="true" />
                    Seed {team.seed}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-[var(--color-ink-soft)]">
                {team.players.join(' & ')}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Move ${team.name} up to position ${index}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-lilac-light)] text-sm font-bold text-[var(--color-brand-lilac-dark)] transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100"
              >
                <span aria-hidden="true">▲</span>
              </button>
              <button
                type="button"
                disabled={disabled || index === order.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Move ${team.name} down to position ${index + 2}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-lilac-light)] text-sm font-bold text-[var(--color-brand-lilac-dark)] transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100"
              >
                <span aria-hidden="true">▼</span>
              </button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Pairs held back from the draw, with the reason they are out. */
export function IneligibleList({
  entries,
}: {
  entries: { team: DrawTeamEntry; reason: string }[]
}) {
  if (entries.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-t border-black/5 pt-3">
      {entries.map(({ team, reason }) => (
        <li
          key={team.id}
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-2.5 py-2"
        >
          <ShuttlecockIcon
            size={16}
            className="shrink-0 text-[var(--color-ink-muted)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--color-ink-soft)]">{team.name}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">
              {team.players.join(' & ')}
            </p>
          </div>
          <Badge status={team.approved ? 'unpaid' : 'pending'} className="shrink-0 text-xs">
            {reason}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
