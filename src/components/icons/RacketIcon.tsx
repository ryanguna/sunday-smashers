import { iconBaseProps, type IconProps } from './types'

export function RacketIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props, 24, 2.25)}>
      <ellipse cx="12" cy="8" rx="6" ry="7" />
      <path d="M9 5.5c1-1 5-1 6 0M8.2 8h7.6M8.7 10.8h6.6M9.5 13.2h5" />
      <path d="M9.8 14.6 4 20.5" />
      <path d="M4 20.5c-.6.6-1.4-.2-.8-.8l1.4-1.4c.6-.6 1.4.2.8.8Z" />
    </svg>
  )
}
