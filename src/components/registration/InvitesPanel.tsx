'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Confetti, EmptyState, Spinner } from '@/components/ui'
import { AlertBanner, DemoModeNotice } from '@/components/auth'
import { GiftIcon, ShuttlecockIcon } from '@/components/icons'
import { canRespondToInvite, describeInvite, type InviteTone } from '@/lib/registration'
import { loadInvites, respondToInvite, type InviteView } from './data'
import { SignInPromptPanel } from './RegistrationStates'

const TONE_TO_BADGE: Record<InviteTone, 'pending' | 'approved' | 'unpaid' | 'info'> = {
  pending: 'pending',
  approved: 'approved',
  unpaid: 'unpaid',
  info: 'info',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // Fixed locale + UTC so the server and client render identical text.
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * `/register/invites` — accept or decline a pending partner invite (and keep
 * an eye on the ones you've sent). Accepting creates the `teams` +
 * `team_members` rows via `respondToInvite`.
 */
export function InvitesPanel() {
  const [invites, setInvites] = useState<InviteView[]>([])
  const [configured, setConfigured] = useState(true)
  const [signedIn, setSignedIn] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  const refresh = useCallback(async () => {
    const result = await loadInvites()
    setConfigured(result.configured)
    setSignedIn(result.signedIn)
    setInvites(result.invites)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadInvites().then((result) => {
      if (cancelled) return
      setConfigured(result.configured)
      setSignedIn(result.signedIn)
      setInvites(result.invites)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRespond(invite: InviteView, accept: boolean) {
    setBusyId(invite.id)
    setMessage(null)
    const result = await respondToInvite(invite.id, accept)
    setBusyId(null)
    setMessage({ tone: result.ok ? 'success' : 'danger', text: result.message })

    if (result.ok) {
      if (accept) {
        setCelebrate(true)
        setTimeout(() => setCelebrate(false), 5000)
      }
      setInvites((current) =>
        current.map((item) =>
          item.id === invite.id ? { ...item, status: accept ? 'accepted' : 'declined' } : item
        )
      )
      if (configured) await refresh()
    }
  }

  if (loading) {
    return (
      <Card variant="frosted" className="border-candy-stripe flex items-center justify-center gap-3 py-14">
        <Spinner size={26} />
        <p className="text-[var(--color-ink-soft)]">Checking the mailbox…</p>
      </Card>
    )
  }

  if (configured && !signedIn) {
    return <SignInPromptPanel />
  }

  const incoming = invites.filter((invite) => !invite.outgoing)
  const outgoing = invites.filter((invite) => invite.outgoing)

  return (
    <div className="grid gap-5">
      <Confetti active={celebrate} count={48} />

      {!configured && <DemoModeNotice what="Responding to partner invites" />}
      {message && <AlertBanner variant={message.tone === 'success' ? 'success' : 'danger'}>{message.text}</AlertBanner>}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-[var(--color-plum)]">
          <GiftIcon size={20} className="text-[var(--color-brand-pink-dark)]" aria-hidden="true" />
          Invites for you
        </h2>

        {incoming.length === 0 ? (
          <EmptyState
            icon={<ShuttlecockIcon size={30} />}
            title="No invites in your stocking yet"
            description="When someone asks you to be their doubles partner it'll land right here. In the meantime you can register solo and join the free-agent pool 🎄"
            action={<Button href="/register">Register now</Button>}
          />
        ) : (
          <ul className="grid gap-3">
            {incoming.map((invite) => {
              const described = describeInvite(invite.status)
              const actionable = canRespondToInvite(invite)
              return (
                <li key={invite.id}>
                  <Card variant="default" className="border border-[var(--color-brand-lilac-light)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-plum)]">
                          {invite.inviterName} wants you as their partner
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          {invite.divisionName} · sent {formatDate(invite.createdAt)}
                        </p>
                      </div>
                      <Badge status={TONE_TO_BADGE[described.tone]}>{described.label}</Badge>
                    </div>

                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{described.blurb}</p>

                    {actionable && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          onClick={() => handleRespond(invite, true)}
                          loading={busyId === invite.id}
                          disabled={busyId !== null && busyId !== invite.id}
                        >
                          Yes — let&rsquo;s smash 🏸
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleRespond(invite, false)}
                          disabled={busyId !== null}
                        >
                          No thanks
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-[var(--color-plum)]">
            <ShuttlecockIcon size={20} className="text-[var(--color-brand-sky-dark)]" aria-hidden="true" />
            Invites you&rsquo;ve sent
          </h2>
          <ul className="grid gap-3">
            {outgoing.map((invite) => {
              const described = describeInvite(invite.status)
              return (
                <li key={invite.id}>
                  <Card variant="outline">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--color-plum)]">
                          {invite.sentTo ?? 'Your chosen partner'}
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          {invite.divisionName} · sent {formatDate(invite.createdAt)}
                        </p>
                      </div>
                      <Badge status={TONE_TO_BADGE[described.tone]}>
                        {invite.status === 'pending' ? 'Waiting on them' : described.label}
                      </Badge>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        Everything else about your entry lives on your{' '}
        <a href="/dashboard" className="font-semibold text-[var(--color-brand-pink-dark)] underline">
          player dashboard
        </a>
        .
      </p>
    </div>
  )
}
