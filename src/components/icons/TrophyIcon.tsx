import { iconBaseProps, type IconProps } from './types'

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10" />
      <path d="M12 14v3M9 21h6M8.5 21c0-2 1-3 1.7-3.5M15.5 21c0-2-1-3-1.7-3.5" />
    </svg>
  )
}
