import type { Metadata } from 'next'
import { Badge, Card, CardBody, GradientText, SectionHeading, Snowfall } from '@/components/ui'
import { BaubleIcon, HollyIcon, ShuttlecockIcon } from '@/components/icons'
import { GalleryExplorer } from '@/components/gallery'
import { loadGalleryPage } from '@/components/gallery/data'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Photos from the Sunday Smashers Christmas Mini Tournament — rallies, medal grins and far too much tinsel.',
}

// Approved photos change through the day; re-render at most once a minute.
export const revalidate = 60

export default async function GalleryPage() {
  const { photos, tournamentId, isDemo } = await loadGalleryPage()
  const featuredCount = photos.filter((photo) => photo.isFeatured).length

  return (
    <main className="relative overflow-hidden">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-6">
        <SectionHeading
          level={1}
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <HollyIcon size={16} />
              The memory wall
            </span>
          }
          title={<GradientText as="span">Photo gallery</GradientText>}
          description={`Every rally, wobble and medal grin from ${TOURNAMENT_DATE_LABEL} — pegged up like polaroids on a string of fairy lights.`}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Badge status="info">
            <span className="inline-flex items-center gap-1.5">
              <ShuttlecockIcon size={14} />
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </span>
          </Badge>
          {featuredCount > 0 && (
            <Badge status="live">
              <span className="inline-flex items-center gap-1.5">
                <BaubleIcon size={14} />
                {featuredCount} picked by the organisers
              </span>
            </Badge>
          )}
        </div>
      </section>

      <section aria-label="Photo gallery" className="relative z-10 mx-auto max-w-6xl px-4 pt-8 pb-14 sm:px-6">
        <GalleryExplorer photos={photos} tournamentId={tournamentId} isDemo={isDemo} />
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Card variant="outline">
          <CardBody className="flex flex-wrap items-center gap-3">
            <ShuttlecockIcon size={22} className="text-[var(--color-brand-lilac-dark)]" />
            <p className="min-w-0 flex-1 text-sm text-[var(--color-ink-soft)]">
              Got a cracker of a shot? Sign in and hit <strong>Add photos</strong> — an organiser
              gives every upload a quick look before it goes up, so give it a moment to appear.
              Please only share photos everyone in them is happy about. 🎄
            </p>
          </CardBody>
        </Card>
      </section>
    </main>
  )
}
