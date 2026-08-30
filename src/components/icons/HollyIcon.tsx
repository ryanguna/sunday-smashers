import { iconBaseProps, type IconProps } from './types'

export function HollyIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <path d="M12 12c-3-4-8-2-8-6 3 0 4 2 5 3-2-3 0-6 3-7-1 3 0 5 1 6 1-1 2-3 1-6 3 1 5 4 3 7 1-1 2-3 5-3 0 4-5 2-8 6Z" />
      <circle cx="10" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12.6" cy="17.6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18.8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}
