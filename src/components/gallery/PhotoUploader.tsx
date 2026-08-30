'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Spinner } from '@/components/ui'
import { GiftIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { AlertBanner } from '@/components/auth'
import { cn } from '@/lib/cn'
import { useAuth } from '@/lib/useAuth'
import { createClient } from '@/lib/supabase/client'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import {
  COMPRESSION_QUALITY,
  FILE_INPUT_ACCEPT,
  MAX_CAPTION_LENGTH,
  MAX_FILES_PER_UPLOAD,
  MAX_IMAGE_EDGE,
  formatBytes,
  galleryStoragePath,
  normaliseCaption,
  normaliseMimeType,
  resizeDimensions,
  storageUploadUrl,
  validateUploadBatch,
} from '@/lib/gallery'
import { getSchedule, teamDisplayName, type PublicMatch } from '@/lib/public-data'

/**
 * Multi-file uploader for signed-in players and admins.
 *
 * Phone photos are 5-12 MB, so every file is decoded and re-encoded to a
 * JPEG no larger than `MAX_IMAGE_EDGE` on its longest edge before it leaves
 * the device. Upload itself goes through `XMLHttpRequest` against the
 * Storage REST endpoint purely so we get real per-file progress events
 * (`supabase-js`'s `storage.upload()` has no progress callback); the
 * `photos` row is then inserted with the normal Supabase client so RLS and
 * types apply.
 *
 * Everything lands as **pending** — `photos.is_approved` defaults to false
 * and an admin approves it at `/admin/gallery`.
 */

type ItemState = 'ready' | 'compressing' | 'uploading' | 'saving' | 'done' | 'error'

interface UploadItem {
  key: string
  file: File
  previewUrl: string
  caption: string
  state: ItemState
  progress: number
  error?: string
}

async function compressImage(file: File): Promise<{ blob: Blob; mime: string }> {
  const mime = normaliseMimeType(file.type, file.name)
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = resizeDimensions(bitmap.width, bitmap.height, MAX_IMAGE_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context')
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', COMPRESSION_QUALITY)
    )
    if (!blob) throw new Error('encode failed')
    return { blob, mime: 'image/jpeg' }
  } catch {
    // HEIC on a browser that can't decode it, or an OOM on a huge panorama —
    // send the original and let Storage keep it as-is.
    return { blob: file, mime: mime || 'image/jpeg' }
  }
}

function putWithProgress(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url, true)
    for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Storage responded ${request.status}`))
    }
    request.onerror = () => reject(new Error('Network error while uploading'))
    request.send(blob)
  })
}

export interface PhotoUploaderProps {
  open: boolean
  onClose: () => void
  tournamentId: string
  /** Called after at least one photo uploaded successfully. */
  onUploaded?: () => void
}

export function PhotoUploader({ open, onClose, tournamentId, onUploaded }: PhotoUploaderProps) {
  const { user, loading, configured } = useAuth()
  const [items, setItems] = useState<UploadItem[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const [matchId, setMatchId] = useState('')
  const [matches, setMatches] = useState<PublicMatch[]>([])
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef(0)
  const objectUrls = useRef<string[]>([])
  const itemCount = items.length

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getSchedule()
      .then((rows) => {
        if (!cancelled) setMatches(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open])

  // Revoke object URLs on unmount so we don't leak blobs. The parent only
  // renders this component while the dialog is open, so unmount == close.
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url)
      objectUrls.current = []
    },
    []
  )

  const matchOptions = useMemo(
    () =>
      matches.map((match) => ({
        id: match.id,
        label: `${match.court ? `${match.court} · ` : ''}${teamDisplayName(match.teamA, match.sourceA)} vs ${teamDisplayName(match.teamB, match.sourceB)}`,
      })),
    [matches]
  )

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      // Candidates keep a reference to the original File; `validateUploadBatch`
      // returns those same objects, so duplicate filenames can't confuse us.
      const candidates = Array.from(fileList).map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        file,
      }))
      const room = Math.max(0, MAX_FILES_PER_UPLOAD - itemCount)
      const { accepted, rejected } = validateUploadBatch(candidates, room)
      setRejections(rejected.map((entry) => entry.message))

      const additions = (accepted as typeof candidates).map((candidate) => {
        keyRef.current += 1
        const previewUrl = URL.createObjectURL(candidate.file)
        objectUrls.current.push(previewUrl)
        return {
          key: `upload-${keyRef.current}`,
          file: candidate.file,
          previewUrl,
          caption: '',
          state: 'ready' as const,
          progress: 0,
        }
      })
      if (additions.length > 0) setItems((current) => [...current, ...additions])
    },
    [itemCount]
  )

  function patchItem(key: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function removeItem(key: string) {
    const target = items.find((item) => item.key === key)
    if (target) {
      URL.revokeObjectURL(target.previewUrl)
      objectUrls.current = objectUrls.current.filter((url) => url !== target.previewUrl)
    }
    setItems((current) => current.filter((item) => item.key !== key))
  }

  async function uploadAll() {
    if (!user || busy) return
    setBusy(true)
    let successes = 0
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token ?? supabaseAnonKey

    for (const item of items) {
      if (item.state === 'done') continue
      try {
        patchItem(item.key, { state: 'compressing', progress: 0.05, error: undefined })
        const { blob, mime } = await compressImage(item.file)

        const photoId = crypto.randomUUID()
        const path = galleryStoragePath(photoId, item.file.name, mime)

        patchItem(item.key, { state: 'uploading', progress: 0.1 })
        await putWithProgress(
          storageUploadUrl(supabaseUrl, path),
          blob,
          {
            authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
            'content-type': mime,
            'cache-control': '3600',
            'x-upsert': 'false',
          },
          (fraction) => patchItem(item.key, { progress: 0.1 + fraction * 0.8 })
        )

        patchItem(item.key, { state: 'saving', progress: 0.95 })
        const { error } = await supabase.from('photos').insert({
          id: photoId,
          tournament_id: tournamentId,
          storage_path: path,
          caption: normaliseCaption(item.caption),
          match_id: matchId || null,
          uploaded_by: user.id,
          is_approved: false,
        })
        if (error) throw new Error(error.message)

        patchItem(item.key, { state: 'done', progress: 1 })
        successes += 1
      } catch (error) {
        patchItem(item.key, {
          state: 'error',
          progress: 0,
          error:
            error instanceof Error
              ? `${error.message} — try again, or nudge an organiser. 🎄`
              : 'Something went wrong. Try again in a moment. 🎄',
        })
      }
    }

    setBusy(false)
    setFinished((count) => count + successes)
    if (successes > 0) onUploaded?.()
  }

  const pendingCount = items.filter((item) => item.state !== 'done').length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add your photos"
      description="Snaps go to an organiser for a quick check before they appear in the gallery."
      className="max-w-2xl"
    >
      {!configured && (
        <AlertBanner variant="info">
          Demo mode — no Supabase project is connected, so uploading is switched off. On the day
          you&rsquo;ll be able to add photos straight from your phone. 📸
        </AlertBanner>
      )}

      {configured && loading && (
        <p className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
          <Spinner size={18} /> Checking your pass&hellip;
        </p>
      )}

      {configured && !loading && !user && (
        <AlertBanner variant="info">
          You need to be signed in to add photos.{' '}
          <a href="/login?next=/gallery" className="font-extrabold underline underline-offset-4">
            Sign in
          </a>{' '}
          and we&rsquo;ll bring you straight back.
        </AlertBanner>
      )}

      {configured && !loading && user && (
        <div className="space-y-4">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              addFiles(event.dataTransfer.files)
            }}
            className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-brand-lilac)] bg-[var(--color-frost-100)] p-5 text-center"
          >
            <ShuttlecockIcon
              size={30}
              className="mx-auto text-[var(--color-brand-lilac-dark)] motion-safe:animate-bob [animation-duration:4s]"
            />
            <p className="mt-2 font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              Drop photos here, or pick them from your phone
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
              Up to {MAX_FILES_PER_UPLOAD} at a time · JPEG, PNG, WebP or HEIC · we shrink them for
              you before they fly
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              Choose photos
            </Button>
          </div>

          {rejections.length > 0 && (
            <AlertBanner variant="danger">
              <ul className="list-disc space-y-1 pl-4">
                {rejections.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertBanner>
          )}

          {items.length > 0 && (
            <>
              <div>
                <label
                  htmlFor="gallery-upload-match"
                  className="mb-1 block text-sm font-bold text-[var(--color-plum)]"
                >
                  Tag these to a match <span className="font-normal text-[var(--color-ink-muted)]">(optional)</span>
                </label>
                <select
                  id="gallery-upload-match"
                  value={matchId}
                  onChange={(event) => setMatchId(event.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-[var(--color-ink)]"
                >
                  <option value="">No match — just festive vibes</option>
                  {matchOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3"
                  >
                    {/* Local blob preview — next/image would need a remote pattern. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-plum)]">
                        {item.file.name}
                        <span className="ml-2 font-normal text-[var(--color-ink-muted)]">
                          {formatBytes(item.file.size)}
                        </span>
                      </p>
                      <label className="sr-only" htmlFor={`caption-${item.key}`}>
                        Caption for {item.file.name}
                      </label>
                      <input
                        id={`caption-${item.key}`}
                        type="text"
                        value={item.caption}
                        maxLength={MAX_CAPTION_LENGTH}
                        placeholder="Add a caption…"
                        disabled={item.state === 'done'}
                        onChange={(event) => patchItem(item.key, { caption: event.target.value })}
                        className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-brand-lilac-light)] bg-white px-2 py-1 text-sm"
                      />
                      {item.state !== 'ready' && (
                        <div className="mt-2">
                          <div
                            className="h-1.5 w-full overflow-hidden rounded-full bg-white"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(item.progress * 100)}
                            aria-label={`Upload progress for ${item.file.name}`}
                          >
                            <div
                              className={cn(
                                'h-full rounded-full',
                                item.state === 'error'
                                  ? 'bg-[var(--color-danger)]'
                                  : 'bg-[image:var(--gradient-candy)]'
                              )}
                              style={{ width: `${Math.round(item.progress * 100)}%` }}
                            />
                          </div>
                          <p
                            className={cn(
                              'mt-1 text-xs',
                              item.state === 'error'
                                ? 'text-[var(--color-danger)]'
                                : 'text-[var(--color-ink-muted)]'
                            )}
                          >
                            {item.state === 'compressing' && 'Shrinking…'}
                            {item.state === 'uploading' &&
                              `Sleighing it up — ${Math.round(item.progress * 100)}%`}
                            {item.state === 'saving' && 'Hanging it on the tree…'}
                            {item.state === 'done' && 'Sent for elf review ✨'}
                            {item.state === 'error' && item.error}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={busy}
                      aria-label={`Remove ${item.file.name}`}
                      className="h-7 shrink-0 rounded-full px-2 text-sm text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-plum)]"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {finished > 0 && (
            <p className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3 text-sm font-semibold text-[var(--color-success)]">
              <SparkleIcon size={16} />
              {finished} {finished === 1 ? 'photo is' : 'photos are'} with the organisers — they
              appear in the gallery once approved.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              type="button"
              variant="festive"
              onClick={uploadAll}
              disabled={busy || pendingCount === 0}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={16} /> Uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <GiftIcon size={16} />
                  Upload {pendingCount > 0 ? pendingCount : ''}{' '}
                  {pendingCount === 1 ? 'photo' : 'photos'}
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
