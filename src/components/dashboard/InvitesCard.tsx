'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, CardBody, Spinner } from '@/components/ui'
import { GiftIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { loadInvites, respondToInvite, type InviteView } from '@/components/registration/data'

export interface InvitesCardProps {
  className?: string
}

const STATUS_COPY: Record<InviteView['status'], string> = {
  pending: 'Waiting on an answer',
  accepted: 'Accepted 🎉',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

/**
 * Pending partner invites, surfaced on the dashboard so nobody misses one.
 * Reuses `loadInvites`/`respondToInvite` from the registration flow (which
 * fall back to demo fixtures when Supabase isn't configured) rather than
 * re-implementing the partner-invite rules here.
 */
export function InvitesCard({ className }: InvitesCardProps) {
  const [invites, setInvites] = useState<InviteView[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    loadInvites()
      .then((result) => {
        if (!cancelled) setInvites(result.invites)
      })
      .catch(() => {
        if (!cancelled) setInvites([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const respond = (invite: InviteView, accept: boolean) => {
    setBusyId(invite.id)
    startTransition(async () => {
      const result = await respondToInvite(invite.id, accept)
      setMessage(result.message)
      setBusyId(null)
      if (result.ok) {
        setInvites((current) =>
          (current ?? []).map((item) =>
            item.id === invite.id ? { ...item, status: accept ? 'accepted' : 'declined' } : item,
          ),
        )
      }
    })
  }

  const incomingPending = (invites ?? []).filter((invite) => invite.status === 'pending' && !invite.outgoing)
  const others = (invites ?? []).filter((invite) => !incomingPending.includes(invite))

  return (
    <Card variant="frosted" className={cn('h-full', className)}>
      <CardBody className="flex h-full flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white">
            <GiftIcon size={16} />
          </span>
          <h3 className="text-base font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Partner invites
          </h3>
          {incomingPending.length > 0 && (
            <Badge status="pending" className="ml-auto">
              {incomingPending.length} waiting on you
            </Badge>
          )}
        </div>

        {invites === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <Spinner size={18} /> Checking your invites…
          </div>
        ) : invites.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            No invites right now. Found someone to pair with?{' '}
            <Link href="/register" className="font-extrabold text-[var(--color-brand-pink-dark)] underline-offset-4 hover:underline">
              Send them an invite
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {incomingPending.map((invite) => (
              <li
                key={invite.id}
                className="rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-pink)] bg-white/90 px-3 py-2.5"
              >
                <p className="text-sm font-bold text-[var(--color-plum)]">
                  {invite.inviterName} wants to pair up
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">{invite.divisionName}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="festive"
                    disabled={pending && busyId === invite.id}
                    onClick={() => respond(invite, true)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending && busyId === invite.id}
                    onClick={() => respond(invite, false)}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}

            {others.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center gap-x-2 rounded-[var(--radius-lg)] bg-white/75 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-[var(--color-plum)]">
                  {invite.outgoing ? `To ${invite.sentTo ?? 'your partner'}` : invite.inviterName}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">{STATUS_COPY[invite.status]}</span>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <p role="status" className="rounded-[var(--radius-lg)] bg-[var(--color-success-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-success)]">
            {message}
          </p>
        )}
      </CardBody>
    </Card>
  )
}
