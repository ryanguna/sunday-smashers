import { iconBaseProps, type IconProps } from './types'

export function ShuttlecockIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <circle cx="12" cy="16.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 14.3 8 5.5l4.4 2.2M12 14.3l6.5-6.4-4.9 1.4M12 14.3 6.6 9.8l1.4 4.7M12 14.3l7.9-3.1-3.2 5.2" />
    </svg>
  )
}
