'use client'

import { Button } from '@/components/ui'

/**
 * Sends the sheet to the printer.
 *
 * `data-print-hide` takes it — and the rest of the on-screen chrome — out of
 * the printed page, so the paper copy is just the scoresheet.
 */
export function PrintButton({ label = 'Print this sheet' }: { label?: string }) {
  return (
    <Button variant="primary" size="sm" type="button" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
