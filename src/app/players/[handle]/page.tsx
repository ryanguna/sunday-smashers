import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Snowfall } from '@/components/ui'
import {
  DemoNotice,
  ProfileDuties,
  ProfileFixtures,
  ProfileHero,
  ProfileRecord,
  ProfileStats,
} from '@/components/players'
import { getPlayerProfile } from '@/lib/player-profile'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ handle: string }>
}

/**
 * Per-profile share metadata, so a link pasted into a group chat previews
 * with the player's name, their pair and how their day is going.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  const profile = await getPlayerProfile(handle)

  if (!profile) {
    return {
      title: 'Player not found',
      description: 'That player is not in the Sunday Smashers Christmas Mini Tournament directory.',
      robots: { index: false, follow: false },
    }
  }

  const title = `${profile.name} — ${profile.team.name}`
  const url = `/players/${profile.handle}`

  return {
    title,
    description: profile.headline,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title: `${title} · Sunday Smashers`,
      description: profile.headline,
      url,
      siteName: 'Sunday Smashers',
      locale: 'en_AU',
      images: [
        {
          url: '/sunday-smashers-logo.jpg',
          width: 1024,
          height: 1536,
          alt: 'Sunday Smashers Christmas Mini Tournament poster',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · Sunday Smashers`,
      description: profile.headline,
      images: ['/sunday-smashers-logo.jpg'],
    },
  }
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { handle } = await params
  const profile = await getPlayerProfile(handle)
  if (!profile) notFound()

  // Player ids and bare name slugs resolve too (the dashboard links by id);
  // send those to the canonical, readable handle.
  if (decodeURIComponent(handle) !== profile.handle) {
    redirect(`/players/${profile.handle}`)
  }

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-8 pb-4 sm:px-6 sm:pt-12">
        <nav aria-label="Breadcrumb">
          <Link
            href="/players"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-sm font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
          >
            <span aria-hidden="true">←</span> All players &amp; pairs
          </Link>
        </nav>

        {!isSupabaseConfigured() && <DemoNotice />}

        <ProfileHero profile={profile} />

        <ProfileRecord profile={profile} />

        <ProfileStats stats={profile.stats} />

        <ProfileFixtures fixtures={profile.fixtures} pairName={profile.team.name} />

        <ProfileDuties duties={profile.duties} />

        <p className="text-center text-sm font-semibold text-[var(--color-ink-muted)]">
          Only names and public results are shown here — never phone numbers or emergency contacts.
        </p>
      </div>
    </main>
  )
}
