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
 * There is no "email me a reset link", because there is no SMTP server to send
 * it (see `docs/GO-LIVE.md`). Rather than 404 the route — the sign-in page
 * links here, and "Forgot password?" is the first thing a stuck player looks
 * for — this page points them at a human.
 *
 * The copy is deliberately one sentence. It previously spent three paragraphs
 * explaining that the tournament sends no email at all, which is an
 * implementation detail the player did not ask about and cannot act on; all
 * they need to know is who to message.
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
      subtitle="Ask an organiser to change it for you."
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
      {contacts.length > 0 ? (
        <dl className="grid gap-3">
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
        Signed in already and just want a different password?{' '}
        <Link
          href="/account/password"
          className="font-semibold text-[var(--color-brand-pink-dark)] hover:underline"
        >
          Change it yourself
        </Link>
        .
      </p>

      <Button href="/login" className="mt-5 w-full">
        Back to sign in
      </Button>
    </AuthShell>
  )
}
