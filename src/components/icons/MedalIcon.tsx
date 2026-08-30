import { iconBaseProps, type IconProps } from './types'

export function MedalIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <path d="M8 3 5 9l3 1M16 3l3 6-3 1" />
      <circle cx="12" cy="14.5" r="6.5" />
      <path d="M12 11.2 12.9 13l2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
