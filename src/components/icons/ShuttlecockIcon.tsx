import { iconBaseProps, type IconProps } from './types'

/**
 * Traced from the brand shuttlecock in `public/brand/icon-shuttlecock.png`:
 * a fanned feather skirt over a rounded cork. Kept as a stroked vector rather
 * than the PNG because all ~150 call sites recolour it through `currentColor`
 * (white inside gradient circles, gold on the TV view, tinted pink in the
 * snowfall) and several render it at 14px or at `vh` sizes on a gym monitor.
 */
export function ShuttlecockIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props, 24, 1.75)}>
      <path d="M9.8 16.3 4.6 6.4a7.6 3 0 0 1 14.8 0l-5.2 9.9" />
      <path d="M12 15.6V3.5M10.8 15.8 8 4.4M13.2 15.8 16 4.4" />
      <circle cx="12" cy="18.4" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
