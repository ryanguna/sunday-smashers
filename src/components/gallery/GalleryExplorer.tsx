'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState } from '@/components/ui'
import { BaubleIcon, GiftIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  DEFAULT_GALLERY_FILTERS,
  dayLabel,
  filterGalleryPhotos,
  prettifyDivision,
  uniqueDays,
  uniqueDivisions,
  uniqueMatchOptions,
  type GalleryFilters,
  type GalleryPhoto,
} from '@/lib/gallery'
import { PhotoCard } from './PhotoCard'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoUploader } from './PhotoUploader'

/**
 * The `/gallery` experience: festive filter chips, a CSS-columns masonry of
 * pegged polaroids, and the keyboard/swipe lightbox.
 *
 * The masonry is pure CSS (`columns-*` + `break-inside-avoid`) rather than a
 * measured JS layout — no ResizeObserver, no layout thrash on a phone, and
 * nothing that could differ between the server and client render.
 */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-bold font-[family-name:var(--font-heading)] transition-colors',
        active
          ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
          : 'bg-white/80 text-[var(--color-ink-soft)] hover:bg-white hover:text-[var(--color-plum)]'
      )}
    >
      {children}
    </button>
  )
}

/** Decorative string of fairy lights the polaroids hang from. */
function FairyLights() {
  const bulbs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const colours = ['#ff8fc7', '#b8a0f0', '#7fe0c0', '#7ec8f2', '#ffc861']
  return (
    <svg
      viewBox="0 0 1200 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-8 w-full text-[var(--color-brand-lilac)]"
    >
      <path
        d="M0 6 Q300 34 600 12 T1200 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.6"
      />
      {bulbs.map((bulb) => {
        const x = 40 + bulb * 100
        const y = bulb % 2 === 0 ? 22 : 18
        return (
          <g key={bulb}>
            <line x1={x} y1={y - 6} x2={x} y2={y} stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
            <circle
              cx={x}
              cy={y + 5}
              r="5"
              fill={colours[bulb % colours.length]}
              className="motion-safe:animate-twinkle"
              style={{ animationDuration: `${2 + (bulb % 4)}s` }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export interface GalleryExplorerProps {
  photos: GalleryPhoto[]
  tournamentId: string
  /** True when Supabase isn't configured — uploads are disabled. */
  isDemo: boolean
}

export function GalleryExplorer({ photos, tournamentId, isDemo }: GalleryExplorerProps) {
  const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_GALLERY_FILTERS)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploaderOpen, setUploaderOpen] = useState(false)

  const divisions = useMemo(() => uniqueDivisions(photos), [photos])
  const days = useMemo(() => uniqueDays(photos), [photos])
  const matchOptions = useMemo(() => uniqueMatchOptions(photos), [photos])

  const visible = useMemo(() => filterGalleryPhotos(photos, filters), [photos, filters])
  const filtered =
    filters.division !== 'all' || filters.matchId !== 'all' || filters.day !== 'all'

  const matchesForDivision =
    filters.division === 'all'
      ? matchOptions
      : matchOptions.filter((option) => option.division === filters.division)

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-white/70 p-4 shadow-[var(--shadow-soft)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            Division
          </span>
          <FilterChip
            active={filters.division === 'all'}
            onClick={() => setFilters({ ...filters, division: 'all', matchId: 'all' })}
          >
            Everything
          </FilterChip>
          {divisions.map((division) => (
            <FilterChip
              key={division}
              active={filters.division === division}
              onClick={() => setFilters({ ...filters, division, matchId: 'all' })}
            >
              {prettifyDivision(division)}
            </FilterChip>
          ))}
        </div>

        {days.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              Day
            </span>
            <FilterChip
              active={filters.day === 'all'}
              onClick={() => setFilters({ ...filters, day: 'all' })}
            >
              All days
            </FilterChip>
            {days.map((day) => (
              <FilterChip
                key={day}
                active={filters.day === day}
                onClick={() => setFilters({ ...filters, day })}
              >
                {dayLabel(day)}
              </FilterChip>
            ))}
          </div>
        )}

        {matchesForDivision.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="gallery-match-filter"
              className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]"
            >
              Match
            </label>
            <select
              id="gallery-match-filter"
              value={filters.matchId}
              onChange={(event) => setFilters({ ...filters, matchId: event.target.value })}
              className="min-w-0 flex-1 rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-1.5 text-sm text-[var(--color-ink)] sm:flex-none"
            >
              <option value="all">Any match</option>
              {matchesForDivision.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-brand-lilac-light)] pt-3">
          <Badge status="info">
            <span className="inline-flex items-center gap-1.5">
              <BaubleIcon size={14} />
              {visible.length} {visible.length === 1 ? 'memory' : 'memories'}
              {filtered ? ` of ${photos.length}` : ''}
            </span>
          </Badge>
          <div className="flex flex-wrap items-center gap-2">
            {filtered && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFilters(DEFAULT_GALLERY_FILTERS)}
              >
                Clear filters
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="festive"
              onClick={() => setUploaderOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <GiftIcon size={15} />
                Add photos
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-2 px-1">
        <FairyLights />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-2"
          icon={<SparkleIcon size={28} />}
          title={
            photos.length === 0
              ? 'No memories captured yet — go make some 🎄📸'
              : 'Nothing under this branch of the tree'
          }
          description={
            photos.length === 0
              ? 'Be the first to hang a photo on the gallery tree. Anything from a warm-up rally to the medal grins.'
              : 'No photos match those filters yet. Try another division, match or day.'
          }
          action={
            photos.length === 0 ? (
              <Button type="button" variant="festive" onClick={() => setUploaderOpen(true)}>
                Add the first photo
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setFilters(DEFAULT_GALLERY_FILTERS)}>
                Show everything
              </Button>
            )
          }
        />
      ) : (
        <div className="mt-1 columns-2 gap-4 sm:columns-3 lg:columns-4 [column-fill:_balance]">
          {visible.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={index}
              priority={index < 4}
              onOpen={() => setLightboxIndex(index)}
            />
          ))}
        </div>
      )}

      <PhotoLightbox
        photos={visible}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />

      {uploaderOpen && (
        <PhotoUploader
          open
          onClose={() => setUploaderOpen(false)}
          tournamentId={tournamentId}
        />
      )}

      {isDemo && (
        <p className="mt-6 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3 text-center text-sm text-[var(--color-info)]">
          Demo mode — these are illustrated stand-ins. On tournament day the real snaps land here
          moments after they&rsquo;re taken. 📸
        </p>
      )}
    </div>
  )
}
