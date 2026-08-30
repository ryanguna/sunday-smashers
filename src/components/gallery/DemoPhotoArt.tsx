import { cn } from '@/lib/cn'

/**
 * Generated festive artwork used wherever a real photo can't be shown:
 * in demo mode (no Supabase Storage bucket exists without env vars) and as
 * the placeholder behind an image that hasn't loaded yet.
 *
 * Everything is derived from `seed` with integer maths and pre-formatted
 * strings — no randomness, no floats interpolated into inline styles — so
 * the server and client markup match exactly.
 */

const PALETTES = [
  ['#ffd6ec', '#e3d8ff', '#c23c81'],
  ['#d3fbec', '#d6efff', '#2b8f6d'],
  ['#e3d8ff', '#ffd6ec', '#6d4fc4'],
  ['#d6efff', '#d3fbec', '#2f7cb3'],
  ['#ffe9bd', '#ffd6ec', '#b47d13'],
  ['#ffd6ec', '#d6efff', '#c23c81'],
] as const

const ASPECTS = [
  { w: 400, h: 300 },
  { w: 400, h: 500 },
  { w: 400, h: 400 },
  { w: 400, h: 340 },
] as const

function Motif({ kind, colour, id }: { kind: number; colour: string; id: string }) {
  const stroke = {
    stroke: colour,
    strokeWidth: 7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
  switch (kind % 4) {
    case 0: // shuttlecock
      return (
        <g {...stroke}>
          <circle cx="0" cy="30" r="15" fill={colour} stroke="none" />
          <path d="M-19 18-42-46h84L19 18" />
          <path d="M-12 16V-44M0 17V-46M12 16V-44" strokeWidth="4" opacity="0.7" />
          <path d="M-30-14h60" strokeWidth="4" opacity="0.7" />
        </g>
      )
    case 1: // bauble
      return (
        <g {...stroke}>
          <circle cx="0" cy="14" r="36" />
          <path d="M-9-24h18v10h-18z" />
          <path d="M-7-24a7 7 0 0 1 14 0" strokeWidth="5" />
          <path d="M-33-2 -16 8 0-2 16 8 33-2" strokeWidth="5" opacity="0.8" />
          <path d="M-14 28q14 10 28 0" strokeWidth="4.5" opacity="0.6" />
        </g>
      )
    case 2: // snowflake
      return (
        <g {...stroke}>
          <path d="M0-48V48M-42-24 42 24M-42 24 42-24" />
          <path
            d="M0-48l-12 12M0-48l12 12M0 48l-12-12M0 48l12-12M-42-24l1 17M-42-24l16 4M42 24l-1-17M42 24l-16-4M-42 24l16-4M-42 24l1-17M42-24l-16 4M42-24l-1 17"
            strokeWidth="4.5"
          />
        </g>
      )
    default: // racket
      return (
        <g {...stroke}>
          <defs>
            <clipPath id={`${id}-head`}>
              <ellipse cx="0" cy="-18" rx="27" ry="33" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-head)`} strokeWidth="3" opacity="0.7">
            <path d="M-16-52V16M0-56V16M16-52V16M-30-36h60M-32-18h64M-30 0h60" />
          </g>
          <ellipse cx="0" cy="-18" rx="27" ry="33" />
          <path d="M-9 14 0 22l9-8" strokeWidth="6" />
          <path d="M0 22v28" strokeWidth="9" />
        </g>
      )
  }
}

export interface DemoPhotoArtProps {
  seed: number
  className?: string
  /** Decorative by default; the surrounding frame supplies the alt text. */
  title?: string
  /** `cover` crops to fill the frame (grid); `contain` shows the whole scene. */
  fit?: 'cover' | 'contain'
}

export function DemoPhotoArt({ seed, className, title, fit = 'cover' }: DemoPhotoArtProps) {
  const index = ((seed % 12) + 12) % 12
  const [from, to, ink] = PALETTES[index % PALETTES.length]
  const { w, h } = ASPECTS[index % ASPECTS.length]
  const gradientId = `ss-demo-art-${index}`

  const dots = [
    { cx: 52, cy: 46, r: 12 },
    { cx: w - 44, cy: 70, r: 18 },
    { cx: 74, cy: h - 52, r: 9 },
    { cx: w - 70, cy: h - 40, r: 14 },
  ]

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={cn('block h-full w-full', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${gradientId})`} />
      {dots.map((dot, dotIndex) => (
        <circle
          key={dot.cx}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill="#ffffff"
          opacity={dotIndex % 2 === 0 ? '0.55' : '0.35'}
        />
      ))}
      <g
        transform={`translate(${Math.round(w / 2)} ${Math.round(h / 2)}) scale(1.35)`}
        opacity="0.9"
      >
        <Motif kind={index} colour={ink} id={gradientId} />
      </g>
    </svg>
  )
}
