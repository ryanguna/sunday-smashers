import { iconBaseProps, type IconProps } from './types'

export function GiftIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <rect x="4" y="9" width="16" height="11" rx="1.2" />
      <path d="M4 13h16M12 9v11" />
      <path d="M12 9C9 9 8 6.5 9.5 5S13 4.5 12 9ZM12 9c3 0 4-2.5 2.5-4S11 3.5 12 9Z" />
    </svg>
  )
}
