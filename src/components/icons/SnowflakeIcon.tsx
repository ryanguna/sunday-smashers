import { iconBaseProps, type IconProps } from './types'

export function SnowflakeIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" />
      <path d="M12 5.5 9.8 4M12 5.5l2.2-1.5M12 18.5l-2.2 1.5M12 18.5l2.2 1.5" />
      <path d="M7 8.4 5 7.8M7 8.4 6.2 10.6M17 8.4l2-.6M17 8.4l.8 2.2M7 15.6l-2 .6M7 15.6l-.8-2.2M17 15.6l2 .6M17 15.6l.8-2.2" />
    </svg>
  )
}
