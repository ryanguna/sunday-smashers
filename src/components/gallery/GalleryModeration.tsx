'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, Card, CardBody, EmptyState, Modal, useToast } from '@/components/ui'
import { HollyIcon, SparkleIcon } from '@/components/icons'
import { AlertBanner } from '@/components/auth'
import { cn } from '@/lib/cn'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { useAuth } from '@/lib/useAuth'
import { type PublicMatch } from '@/lib/public-data'
import {
  MAX_CAPTION_LENGTH,
  MAX_REJECTION_REASON_LENGTH,
  canFeature,
  canTransition,
  countByStatus,
  dayKeyOf,
  dayLabel,
  moderationBadgeStatus,
  moderationLabel,
  moderationPatch,
  normaliseCaption,
  normaliseRejectionReason,
  updatePhotoRow,
  type GalleryPhoto,
  type GallerySupabaseClient,
  type PhotoModerationStatus,
} from '@/lib/gallery'
import { matchLabel as labelForMatch } from './data'
import { PhotoImage } from './PhotoImage'

/**
 * Admin moderation surface for `/admin/gallery`.
 *
 * Uploads land as **pending**; nothing reaches the public gallery until an
 * admin approves it here. Approve / reject / feature write the real
 * moderation columns added by migration `0003` — `moderation_status`,
 * `is_featured`, `rejection_reason` — and let the `sync_photo_moderation`
 * trigger keep `is_approved` and `moderated_at` in step.
 *
 * The queue is fetched by the Server Component page and handed down as
 * props, so this component owns no data-loading effect: it renders instantly
 * and every state change happens in an event handler.
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

export interface GalleryModerationProps {
  /** Queue rendered on first paint, fetched by the Server Component page. */
  photos: GalleryPhoto[]
  /** Schedule used by the match-tag dropdown. */
  matches: PublicMatch[]
}

export function GalleryModeration({ photos: initialPhotos, matches }: GalleryModerationProps) {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()
  const configured = isSupabaseConfigured()

  const [photos, setPhotos] = useState<GalleryPhoto[]>(initialPhotos)
  const [tab, setTab] = useState<StatusTab>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<GalleryPhoto | null>(null)
  const [draftCaption, setDraftCaption] = useState('')
  const [draftMatchId, setDraftMatchId] = useState('')
  const [rejecting, setRejecting] = useState<GalleryPhoto | null>(null)
  const [draftReason, setDraftReason] = useState('')

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

  function demoToast(description: string) {
    toast({ title: 'Demo mode', description, variant: 'warning' })
  }

  async function moderate(photo: GalleryPhoto, next: PhotoModerationStatus, reason: string | null = null) {
    if (!canTransition(photo.status, next)) return
    if (!configured || !user) {
      demoToast('Connect Supabase to moderate for real — nothing was saved.')
      return
    }
    setBusyId(photo.id)
    // Writes `moderation_status` only: the database trigger derives
    // `is_approved`, stamps `moderated_at`, and un-features anything that
    // leaves the approved state.
    const { error } = await updatePhotoRow(client()!, photo.id, moderationPatch(next, user.id, reason))
    setBusyId(null)
    if (error) {
      toast({ title: 'Couldn’t save that', description: error.message, variant: 'danger' })
      return
    }
    patchLocal(photo.id, {
      status: next,
      isFeatured: next === 'approved' ? photo.isFeatured : false,
      rejectionReason: next === 'rejected' ? normaliseRejectionReason(reason) : null,
      moderatedAt: new Date().toISOString(),
    })
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

  function openRejector(photo: GalleryPhoto) {
    setRejecting(photo)
    setDraftReason(photo.rejectionReason ?? '')
  }

  async function confirmReject() {
    const photo = rejecting
    if (!photo) return
    const reason = draftReason
    setRejecting(null)
    await moderate(photo, 'rejected', reason)
  }

  async function toggleFeatured(photo: GalleryPhoto) {
    if (!canFeature(photo.status)) {
      toast({
        title: 'Approve it first',
        description: 'Only photos that are on the tree can be featured.',
        variant: 'warning',
      })
      return
    }
    if (!configured || !user) {
      demoToast('Featuring is disabled without a Supabase project.')
      return
    }
    setBusyId(photo.id)
    const { error } = await updatePhotoRow(client()!, photo.id, {
      is_featured: !photo.isFeatured,
    })
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
      demoToast('Deleting is disabled without a Supabase project.')
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
      demoToast('Captions and tags can’t be saved without a Supabase project.')
      setEditing(null)
      return
    }
    setBusyId(photo.id)
    const { error } = await updatePhotoRow(client()!, photo.id, {
      caption: normaliseCaption(draftCaption),
      match_id: draftMatchId || null,
    })
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
              <Card
                className={cn(
                  'h-full border-l-4',
                  photo.status === 'approved' && 'border-l-[var(--color-brand-mint-dark)]',
                  photo.status === 'rejected' && 'border-l-[var(--color-ink-muted)]',
                  photo.status === 'pending' && 'border-l-[var(--color-brand-pink-dark)]',
                  photo.isFeatured && 'shadow-[var(--shadow-glow-pink)]'
                )}
              >
                <CardBody className="space-y-3">
                  <div
                    className={cn(
                      'relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-frost-200)]',
                      photo.status === 'rejected' && 'opacity-60 grayscale',
                      photo.isFeatured &&
                        'ring-2 ring-[var(--color-brand-pink-dark)] ring-offset-2 ring-offset-white'
                    )}
                  >
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
                    {photo.status === 'rejected' && photo.rejectionReason && (
                      <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-frost-200)] px-2 py-1.5 text-xs text-[var(--color-ink-soft)]">
                        <span className="font-bold">Why: </span>
                        {photo.rejectionReason}
                      </p>
                    )}
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
                        onClick={() => openRejector(photo)}
                      >
                        Reject
                      </Button>
                    )}
                    {photo.status === 'rejected' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === photo.id}
                        onClick={() => moderate(photo, 'pending')}
                      >
                        Back to queue
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === photo.id || !canFeature(photo.status)}
                      title={
                        canFeature(photo.status)
                          ? undefined
                          : 'Only approved photos can be featured'
                      }
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

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Set this one aside"
        description="Leave an optional note so the next elf knows why."
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor="moderation-reason"
              className="mb-1 block text-sm font-bold text-[var(--color-plum)]"
            >
              Reason <span className="font-normal text-[var(--color-ink-muted)]">(optional)</span>
            </label>
            <textarea
              id="moderation-reason"
              rows={3}
              value={draftReason}
              maxLength={MAX_REJECTION_REASON_LENGTH}
              placeholder="Blurry, duplicate, ceiling shot…"
              onChange={(event) => setDraftReason(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={confirmReject}>
              Set aside
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
