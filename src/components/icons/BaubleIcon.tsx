import { iconBaseProps, type IconProps } from './types'

export function BaubleIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <rect x="10.5" y="2" width="3" height="2.4" rx="0.6" />
      <path d="M12 4.4v2.2" />
      <circle cx="12" cy="14" r="7.2" />
      <path d="M6 11.5c3 1.4 9 1.4 12 0" />
    </svg>
  )
}
