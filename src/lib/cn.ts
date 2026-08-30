/**
 * Tiny class-name merge helper. Accepts strings, numbers, arrays, objects
 * (keyed by class name with a truthy/falsy value), null/undefined/false,
 * and flattens/dedupes the result into a single className string.
 *
 * This intentionally does NOT attempt Tailwind-aware conflict resolution
 * (like tailwind-merge) — it's a plain conditional class joiner.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [className: string]: boolean | null | undefined }

function toClassList(value: ClassValue, out: string[]): void {
  if (!value && value !== 0) return

  if (typeof value === 'string' || typeof value === 'number') {
    const str = String(value).trim()
    if (str) out.push(str)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) toClassList(item, out)
    return
  }

  if (typeof value === 'object') {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key]) {
        out.push(key)
      }
    }
  }
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []
  for (const input of inputs) toClassList(input, out)

  // De-dupe while preserving the last occurrence order for simple overrides.
  const seen = new Set<string>()
  const result: string[] = []
  for (const cls of out.join(' ').split(/\s+/).filter(Boolean)) {
    if (!seen.has(cls)) {
      seen.add(cls)
      result.push(cls)
    }
  }
  return result.join(' ')
}
