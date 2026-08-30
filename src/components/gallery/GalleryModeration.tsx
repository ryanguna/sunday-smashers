'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, CardBody, EmptyState, Modal, Spinner, useToast } from '@/components/ui'
import { HollyIcon, SparkleIcon } from '@/components/icons'
import { AlertBanner } from '@/components/auth'
import { cn } from '@/lib/cn'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { useAuth } from '@/lib/useAuth'
import { getSchedule, type PublicMatch } from '@/lib/public-data'
import {
  MAX_CAPTION_LENGTH,
  canTransition,
  captionForStorage,
  countByStatus,
  dayKeyOf,
  dayLabel,
  getModerationQueue,
  moderationBadgeStatus,
  moderationLabel,
  moderationPatch,
  normaliseCaption,
  type GalleryPhoto,
  type GallerySupabaseClient,
  type PhotoModerationStatus,
} from '@/lib/gallery'
import { buildMatchIndex, matchLabel as labelForMatch } from './data'
import { PhotoImage } from './PhotoImage'

/**
 * Admin moderation surface for `/admin/gallery`.
 *
 * Uploads land as **pending**; nothing reaches the public gallery until an
 * admin approves it here. Approve / reject / feature all write to the same
 * two columns the schema gives us (`is_approved`, `approved_by`) plus the
 * caption marker — see the header comment in `@/lib/gallery` for why.
 *
 * Data is fetched in the browser (the admin's session cookie is what lets
 * RLS return unapproved rows), so this component never touches
 * `@/lib/supabase/server` and can stay a Client Component.
 */

type StatusTab = PhotoModerationStatus | 'all'

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'pending', label: 'Awaiting review' },
  { id: 'approved', label: 'On the tree' },
  { id: 'rejected', label: 'Set aside' },
  { id: 'all', label: 'Everything' },
]

function client(): GallerySupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  return createClient() as unknown as GallerySupabaseClient
}

export function GalleryModeration() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const configured = isSupabaseConfigured()

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GalleryPhoto | null>(null)
  const [draftCaption, setDraftCaption] = useState('')
  const [draftMatchId, setDraftMatchId] = useState('')
  const [matches, setMatches] = useState<PublicMatch[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    let schedule: PublicMatch[] = []
    try {
      schedule = await getSchedule()
    } catch {
      schedule = []
    }
    setMatches(schedule)
    const queue = await getModerationQueue(client(), { matches: buildMatchIndex(schedule) })
    setPhotos(queue)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => countByStatus(photos), [photos])
  const visible = useMemo(
    () => (tab === 'all' ? photos : photos.filter((photo) => photo.status === tab)),
    [photos, tab]
  )

  function patchLocal(id: string, patch: Partial<GalleryPhoto>) {
    setPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo))
    )
  }

  async function moderate(photo: GalleryPhoto, next: PhotoModerationStatus) {
    if (!canTransition(photo.status, next)) return
    if (!configured || !user) {
      toast({
        title: 'Demo mode',
        description: 'Connect Supabase to moderate for real — nothing was saved.',
        variant: 'warning',
      })
      return
    }
    setBusyId(photo.id)
    const supabase = client()
    const { error } = await supabase!
      .from('photos')
      .update(moderationPatch(next, user.id))
      .eq('id', photo.id)
    setBusyId(null)
    if (error) {
      toast({ title: 'Couldn’t save that', description: error.message, variant: 'danger' })
      return
    }
    patchLocal(photo.id, { status: next })
    toast({
      title:
        next === 'approved'
          ? 'Hung on the tree ✨'
          : next === 'rejected'
            ? 'Set aside'
            : 'Back in the queue',
      variant: next === 'approved' ? 'success' : 'default',
    })
  }

  async function toggleFeatured(photo: GalleryPhoto) {
    if (!configured || !user) {
      toast({
        title: 'Demo mode',
        description: 'Featuring is disabled without a Supabase project.',
        variant: 'warning',
      })
      return
    }
    setBusyId(photo.id)
    const supabase = client()
    const { error } = await supabase!
      .from('photos')
      .update({ caption: captionForStorage(photo.caption, !photo.isFeatured) })
      .eq('id', photo.id)
    setBusyId(null)
    if (error) {
      toast({ title: 'Couldn’t save that', description: error.message, variant: 'danger' })
      return
    }
    patchLocal(photo.id, { isFeatured: !photo.isFeatured })
    toast({
      title: photo.isFeatured ? 'Un-starred' : 'Pick of the day! ⭐',
      variant: 'festive',
    })
  }

  async function remove(photo: GalleryPhoto) {
    if (!configured || !user) {
      toast({
        title: 'Demo mode',
        description: 'Deleting is disabled without a Supabase project.',
        variant: 'warning',
      })
      return
    }
    if (!window.confirm('Delete this photo for good? This also removes the file from storage.')) {
      return
    }
    setBusyId(photo.id)
    const supabase = client()
    await supabase!.storage.from('gallery').remove([photo.storagePath])
    const { error } = await supabase!.from('photos').delete().eq('id', photo.id)
    setBusyId(null)
    if (error) {
      toast({ title: 'Couldn’t delete that', description: error.message, variant: 'danger' })
      return
    }
    setPhotos((current) => current.filter((item) => item.id !== photo.id))
    toast({ title: 'Gone for good', variant: 'default' })
  }

  function openEditor(photo: GalleryPhoto) {
    setEditing(photo)
    setDraftCaption(photo.caption ?? '')
    setDraftMatchId(photo.matchId ?? '')
  }

  async function saveEdits() {
    const photo = editing
    if (!photo) return
    if (!configured || !user) {
      toast({
        title: 'Demo mode',
        description: 'Captions and tags can’t be saved without a Supabase project.',
        variant: 'warning',
      })
      setEditing(null)
      return
    }
    setBusyId(photo.id)
    const supabase = client()
    const { error } = await supabase!
      .from('photos')
      .update({
        caption: captionForStorage(draftCaption, photo.isFeatured),
        match_id: draftMatchId || null,
      })
      .eq('id', photo.id)
    setBusyId(null)
    if (error) {
      toast({ title: 'Couldn’t save that', description: error.message, variant: 'danger' })
      return
    }
    const tagged = matches.find((match) => match.id === draftMatchId)
    patchLocal(photo.id, {
      caption: normaliseCaption(draftCaption),
      matchId: draftMatchId || null,
      matchLabel: tagged ? labelForMatch(tagged) : null,
      division: tagged?.division ?? null,
    })
    setEditing(null)
    toast({ title: 'Saved', variant: 'success' })
  }

  if (authLoading || loading) {
    return (
      <p className="flex items-center gap-2 text-[var(--color-ink-soft)]">
        <Spinner size={20} /> Sorting through the shoebox of photos&hellip;
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {!configured && (
        <AlertBanner variant="info">
          Demo mode — this is a sample queue. Connect Supabase and the real uploads appear here,
          approve/reject buttons included.
        </AlertBanner>
      )}
      {configured && !isAdmin && (
        <AlertBanner variant="danger">
          Your account no longer has the admin role, so moderation actions will be rejected.
        </AlertBanner>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Moderation queue filter">
        {TABS.map((item) => {
          const count =
            item.id === 'all'
              ? photos.length
              : counts[item.id as PhotoModerationStatus]
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-[var(--radius-pill)] px-3.5 py-1.5 text-sm font-bold font-[family-name:var(--font-heading)] transition-colors',
                tab === item.id
                  ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                  : 'bg-white text-[var(--color-ink-soft)] hover:text-[var(--color-plum)]'
              )}
            >
              {item.label}
              <span className="ml-1.5 opacity-80">{count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<HollyIcon size={28} />}
          title="Nothing in this pile"
          description="When players upload from the sidelines, their photos land here for a quick check."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((photo) => (
            <li key={photo.id}>
              <Card className="h-full">
                <CardBody className="space-y-3">
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-frost-200)]">
                    <PhotoImage photo={photo} sizes="(max-width: 640px) 90vw, 320px" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status={moderationBadgeStatus(photo.status)}>
                      {moderationLabel(photo.status)}
                    </Badge>
                    {photo.isFeatured && (
                      <Badge status="live">
                        <span className="inline-flex items-center gap-1">
                          <SparkleIcon size={12} />
                          Featured
                        </span>
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm">
                    <p className="text-[var(--color-ink)]">
                      {photo.caption ?? (
                        <span className="italic text-[var(--color-ink-muted)]">No caption</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                      {dayLabel(dayKeyOf(photo.createdAt))}
                      {photo.matchLabel ? ` · ${photo.matchLabel}` : ' · untagged'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {photo.status !== 'approved' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={busyId === photo.id}
                        onClick={() => moderate(photo, 'approved')}
                      >
                        Approve
                      </Button>
                    )}
                    {photo.status !== 'rejected' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === photo.id}
                        onClick={() => moderate(photo, 'rejected')}
                      >
                        Reject
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === photo.id}
                      onClick={() => toggleFeatured(photo)}
                    >
                      {photo.isFeatured ? 'Un-feature' : 'Feature'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === photo.id}
                      onClick={() => openEditor(photo)}
                    >
                      Caption &amp; tag
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={busyId === photo.id}
                      onClick={() => remove(photo)}
                    >
                      Delete
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Caption & tag"
        description="Captions become the photo’s alt text, so describe what’s happening."
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor="moderation-caption"
              className="mb-1 block text-sm font-bold text-[var(--color-plum)]"
            >
              Caption
            </label>
            <input
              id="moderation-caption"
              type="text"
              value={draftCaption}
              maxLength={MAX_CAPTION_LENGTH}
              onChange={(event) => setDraftCaption(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] px-3 py-2"
            />
          </div>
          <div>
            <label
              htmlFor="moderation-match"
              className="mb-1 block text-sm font-bold text-[var(--color-plum)]"
            >
              Match
            </label>
            <select
              id="moderation-match"
              value={draftMatchId}
              onChange={(event) => setDraftMatchId(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2"
            >
              <option value="">Not tagged to a match</option>
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {labelForMatch(match)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={saveEdits}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
