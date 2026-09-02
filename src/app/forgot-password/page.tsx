import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui'
import { BaubleIcon } from '@/components/icons'
import { AuthShell } from '@/components/auth/AuthShell'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'How to get back into your Sunday Smashers account.',
}

/**
 * There is no "email me a reset link" any more, because there is no SMTP
 * server to send it (see `docs/GO-LIVE.md`). Rather than 404 the route — the
 * sign-in page links here, and "Forgot password?" is the first thing a stuck
 * player looks for — this page tells them the truth and gives them a human to
 * ask.
 *
 * The organiser's contact details come from the tournament row, so the
 * committee can change who fields these requests without a redeploy. If they
 * haven't filled any in yet we say so plainly instead of rendering an empty
 * card that looks broken.
 */
export default async function ForgotPasswordPage() {
  const config = await loadPublicTournamentConfig()
  const contacts = [
    config.contactName ? { label: 'Ask for', value: config.contactName, href: null } : null,
    config.contactPhone
      ? { label: 'Phone or text', value: config.contactPhone, href: `tel:${config.contactPhone.replace(/\s+/g, '')}` }
      : null,
  ].filter((entry): entry is { label: string; value: string; href: string | null } => entry !== null)

  return (
    <AuthShell
      icon={<BaubleIcon size={26} />}
      eyebrow="Locked out?"
      title="Let's get you back on court"
      subtitle="Password resets are done by a human, not a robot."
      footer={
        <>
          Remembered it?{' '}
          <Link
            href="/login"
            className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-4 text-sm text-[var(--color-info)]">
        <p className="font-[family-name:var(--font-heading)] font-bold">
          We can&apos;t email you a reset link
        </p>
        <p className="mt-1.5 font-medium">
          Sunday Smashers doesn&apos;t send email at all — no confirmation messages, no reset links,
          nothing to get lost in a spam folder. Message an organiser instead and they&apos;ll set a
          new password on your account straight away.
        </p>
      </div>

      {contacts.length > 0 ? (
        <dl className="mt-5 grid gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.label}
              className="flex items-baseline justify-between gap-4 rounded-[var(--radius-md)] bg-white/70 px-4 py-3"
            >
              <dt className="text-sm font-semibold text-[var(--color-ink-muted)]">
                {contact.label}
              </dt>
              <dd className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                {contact.href ? (
                  <a href={contact.href} className="underline hover:no-underline">
                    {contact.value}
                  </a>
                ) : (
                  contact.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
          The committee hasn&apos;t published contact details yet. Grab whoever is running the draw
          in the group chat — they can sort it out.
        </p>
      )}

      <p className="mt-5 text-sm text-[var(--color-ink-soft)]">
        Once they&apos;ve set a new password for you, sign in with it and change it to something you
        like from your dashboard.
      </p>

      <Button href="/login" className="mt-5 w-full">
        Back to sign in
      </Button>
    </AuthShell>
  )
}
