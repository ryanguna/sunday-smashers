import { iconBaseProps, type IconProps } from './types'

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...iconBaseProps(props)}>
      <path
        d="M12 2c.6 3.6 2 6 5.5 7-3.5 1-4.9 3.4-5.5 7-.6-3.6-2-6-5.5-7 3.5-1 4.9-3.4 5.5-7Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M19 15.5c.3 1.6.9 2.6 2.4 3.1-1.5.5-2.1 1.5-2.4 3.1-.3-1.6-.9-2.6-2.4-3.1 1.5-.5 2.1-1.5 2.4-3.1Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
