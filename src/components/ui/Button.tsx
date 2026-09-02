import { forwardRef } from 'react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'festive'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * `primary` follows the brand kit's own button rule: the pink-to-lavender
 * gradient carries **navy** text, not white.
 *
 * That is also the accessible choice, and the reason the change was made. The
 * kit's pastels are pale by design — white on them measures about 2:1, well
 * under WCAG AA, and it went unnoticed because axe cannot evaluate contrast
 * against a `background-image`, so the automated pass had nothing to report.
 * Navy on the same gradient measures 7.2:1 at its lightest stop.
 *
 * `secondary` mirrors the kit's outline button: white fill, lavender border.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[image:var(--gradient-brand)] text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)] hover:brightness-105 active:brightness-95',
  secondary:
    'bg-white text-[var(--color-plum)] border-2 border-[var(--color-brand-lilac)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-brand-lilac-light)]/40',
  ghost: 'bg-transparent text-[var(--color-plum)] hover:bg-[var(--color-brand-lilac-light)]/50',
  danger: 'bg-[var(--color-danger)] text-white shadow-[var(--shadow-soft)] hover:brightness-105',
  festive:
    'bg-[image:var(--gradient-gold)] text-[var(--color-plum)] shadow-[var(--shadow-glow-mint)] hover:brightness-105',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm px-3.5 py-1.5 gap-1.5',
  md: 'text-base px-5 py-2.5 gap-2',
  lg: 'text-lg px-7 py-3.5 gap-2.5',
}

const baseClasses =
  'inline-flex items-center justify-center rounded-[var(--radius-pill)] font-[family-name:var(--font-heading)] font-semibold transition-transform duration-150 ease-[var(--ease-bounce)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97] whitespace-nowrap'

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

interface SharedProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  className?: string
  children?: ReactNode
}

export interface ButtonProps extends SharedProps, ButtonHTMLAttributes<HTMLButtonElement> {
  href?: undefined
}

export interface ButtonLinkProps extends SharedProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
}

export type PolymorphicButtonProps = ButtonProps | ButtonLinkProps

function isLinkProps(props: PolymorphicButtonProps): props is ButtonLinkProps {
  return typeof props.href === 'string'
}

/**
 * Festive pill button. Renders an `<a>` when given an `href`, otherwise a `<button>`.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, PolymorphicButtonProps>(
  function Button(props, ref) {
    const { variant = 'primary', size = 'md', loading = false, className, children, ...rest } = props

    const classes = cn(baseClasses, variantClasses[variant], sizeClasses[size], className)

    if (isLinkProps(props)) {
      const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={classes}
          aria-disabled={loading || undefined}
          {...anchorRest}
        >
          {loading && <Spinner />}
          {children}
        </a>
      )
    }

    const { disabled, ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...buttonRest}
      >
        {loading && <Spinner />}
        {children}
      </button>
    )
  }
)
