import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in pixels (applied to both width & height). Defaults to 24. */
  size?: number | string
}

/** Shared default props applied by every icon in this module. */
export function iconBaseProps(props: IconProps, size = 24) {
  const { size: propSize, ...rest } = props
  return {
    width: propSize ?? size,
    height: propSize ?? size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': rest['aria-label'] ? undefined : true,
    ...rest,
  }
}
