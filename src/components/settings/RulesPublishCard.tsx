'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { Badge, Button } from '@/components/ui'
import { HollyIcon } from '@/components/icons'
import { SettingsCard } from './Chrome'

export interface RulesPublishCardProps {
  /** Whether the committee has already marked the rules final. */
  published: boolean
  publish: (final: boolean) => Promise<{ ok: boolean; message: string }>
  readOnly?: boolean
}

/**
 * The publish switch for the Rules page.
 *
 * ## Why this is here and not only under "Messages"
 *
 * The public Rules page carries a "working draft — may still change" banner
 * until the committee says otherwise. The flag behind it (`rulesAreFinal`)
 * originally lived only in the Messages editor, alongside the approval and
 * decline wording. That is a defensible home for it — it is a piece of copy —
 * but it is not where anyone looks. Somebody who has just finished setting the
 * points, the deuce rules and the qualifying places is standing on the Rules
 * page, and the only thing that page told them was that the rules were a draft.
 * There was no button, and no hint that the button was two tabs away.
 *
 * So the switch appears in both places and writes the same flag. There is no
 * second source of truth: this calls the same action the Messages editor does.
 */
export function RulesPublishCard({ published, publish, readOnly = false }: RulesPublishCardProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const toggle = useCallback(() => {
    // Publishing is reversible and harmless, so it goes straight through.
    // Un-publishing puts a "these may still change" banner back in front of
    // every player who has already read the rules, which is worth a beat of
    // hesitation — especially if the draw is already out.
    if (published && !window.confirm('Put the rules back into draft? The public page will say they may still change.')) {
      return
    }
    startTransition(async () => {
      setResult(await publish(!published))
    })
  }, [published, publish])

  return (
    <SettingsCard
      title={published ? 'Rules are published' : 'Rules are a draft'}
      description={
        published
          ? 'The public Rules page shows them as final. Players are being told to play them as written.'
          : 'The public Rules page carries a “working draft” banner. Publish once the format is settled.'
      }
      icon={<HollyIcon size={20} />}
      tone={published ? 'mint' : 'gold'}
      meta={<Badge status={published ? 'approved' : 'pending'}>{published ? 'Final' : 'Draft'}</Badge>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={published ? 'secondary' : 'primary'}
          onClick={toggle}
          disabled={readOnly || pending}
        >
          {pending ? 'Saving…' : published ? 'Return to draft' : 'Publish the rules'}
        </Button>
        <Link
          href="/rules"
          className="inline-flex min-h-[24px] items-center text-sm font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
        >
          See the public page →
        </Link>
      </div>

      {result && (
        <p
          role="status"
          className={
            result.ok
              ? 'mt-3 rounded-[var(--radius-md)] bg-[var(--color-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]'
              : 'mt-3 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]'
          }
        >
          {result.message}
        </p>
      )}
    </SettingsCard>
  )
}
