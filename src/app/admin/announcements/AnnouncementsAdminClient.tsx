'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  GradientText,
  Modal,
  SectionHeading,
  Snowfall,
  ToastProvider,
  useToast,
} from '@/components/ui'
import { BaubleIcon, GiftIcon, HollyIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { Markdown } from '@/components/Markdown'
import { AlertBanner } from '@/components/auth/DemoModeNotice'
import { TextField } from '@/components/auth/FormField'
import { cn } from '@/lib/cn'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { AnnouncementRow } from '@/lib/supabase/types'
import {
  accentForAnnouncement,
  excerpt,
  filterAnnouncements,
  formatAnnouncementDateTime,
  sortAnnouncements,
  toAnnouncement,
  validateAnnouncementDraft,
  type Announcement,
  type AnnouncementStatusFilter,
} from '@/lib/announcements'
import { ACCENT_STYLES } from '@/components/announcements'

const STATUS_TABS: { id: AnnouncementStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
]

const BODY_PLACEHOLDER = `Doors open at **8:15am** and the call room opens at 8:30am.

- Check in at the desk before you warm up
- Grab your loot bag while you're there

Supports # headings, - bullets and **bold**.`

interface EditorState {
  /** `null` while creating a brand new notice. */
  id: string | null
  title: string
  body: string
  isPinned: boolean
  isPublished: boolean
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: '',
  body: '',
  isPinned: false,
  isPublished: false,
}

export interface AnnouncementsAdminProps {
  initialAnnouncements: Announcement[]
  /** Null against a real project that has no tournament row yet. */
  tournamentId: string | null
}

/** Wraps the composer in its own ToastProvider — the root layout has none. */
export function AnnouncementsAdmin(props: AnnouncementsAdminProps) {
  return (
    <ToastProvider>
      <AnnouncementsComposer {...props} />
    </ToastProvider>
  )
}

function AnnouncementsComposer({ initialAnnouncements, tournamentId }: AnnouncementsAdminProps) {
  const { toast } = useToast()
  const demoMode = !isSupabaseConfigured()

  const [items, setItems] = useState<Announcement[]>(() => sortAnnouncements(initialAnnouncements))
  const [status, setStatus] = useState<AnnouncementStatusFilter>('all')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const visible = useMemo(() => filterAnnouncements(items, { status, query }), [items, status, query])
  const publishedCount = items.filter((a) => a.isPublished).length
  const draftCount = items.length - publishedCount

  function upsertLocal(next: Announcement) {
    setItems((current) => {
      const exists = current.some((a) => a.id === next.id)
      const merged = exists ? current.map((a) => (a.id === next.id ? next : a)) : [next, ...current]
      return sortAnnouncements(merged)
    })
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return

    const validation = validateAnnouncementDraft(editor)
    setErrors(validation)
    if (validation.title || validation.body) return

    setSaving(true)
    setServerError(null)
    const nowIso = new Date().toISOString()

    if (demoMode) {
      upsertLocal({
        id: editor.id ?? `demo-new-${Date.now()}`,
        tournamentId: tournamentId ?? 'demo-tournament',
        title: editor.title.trim(),
        body: editor.body.trim(),
        isPinned: editor.isPinned,
        isPublished: editor.isPublished,
        createdAt: editor.id ? (items.find((a) => a.id === editor.id)?.createdAt ?? nowIso) : nowIso,
        updatedAt: nowIso,
      })
      setSaving(false)
      setEditor(null)
      toast({
        title: 'Saved in demo mode 🎄',
        description: 'No database is connected, so this notice only lives in your browser.',
        variant: 'festive',
      })
      return
    }

    try {
      const supabase = createClient()
      const payload = {
        title: editor.title.trim(),
        body: editor.body.trim(),
        is_pinned: editor.isPinned,
        is_published: editor.isPublished,
      }

      // A new notice has to hang off a real tournament row. Rather than post
      // it against an invented id, say so and stop.
      if (!editor.id && !tournamentId) {
        throw new Error(
          'There is no tournament set up yet, so there is nothing to pin this notice to. Create it in Settings first.',
        )
      }

      const { data, error } = editor.id
        ? await supabase.from('announcements').update(payload).eq('id', editor.id).select().single()
        : await supabase
            .from('announcements')
            .insert({ ...payload, tournament_id: tournamentId as string })
            .select()
            .single()

      if (error) throw new Error(error.message)
      upsertLocal(toAnnouncement(data as AnnouncementRow))
      setEditor(null)
      toast({
        title: editor.id ? 'Announcement updated' : 'Announcement posted 🎉',
        description: editor.isPublished
          ? 'It is live on the announcements page now.'
          : 'Saved as a draft — publish it when you are ready.',
        variant: 'success',
      })
    } catch (caught) {
      setServerError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function patch(announcement: Announcement, changes: Partial<Announcement>, message: string) {
    const next = { ...announcement, ...changes, updatedAt: new Date().toISOString() }
    setBusyId(announcement.id)
    setServerError(null)

    if (!demoMode) {
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('announcements')
          .update({
            is_pinned: next.isPinned,
            is_published: next.isPublished,
          })
          .eq('id', announcement.id)
        if (error) throw new Error(error.message)
      } catch (caught) {
        setBusyId(null)
        setServerError(caught instanceof Error ? caught.message : 'Update failed. Try again.')
        return
      }
    }

    upsertLocal(next)
    setBusyId(null)
    toast({ title: message, variant: 'festive' })
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setBusyId(target.id)
    setServerError(null)

    if (!demoMode) {
      try {
        const supabase = createClient()
        const { error } = await supabase.from('announcements').delete().eq('id', target.id)
        if (error) throw new Error(error.message)
      } catch (caught) {
        setBusyId(null)
        setServerError(caught instanceof Error ? caught.message : 'Delete failed. Try again.')
        return
      }
    }

    setItems((current) => current.filter((a) => a.id !== target.id))
    setBusyId(null)
    setPendingDelete(null)
    toast({ title: 'Announcement deleted', description: target.title, variant: 'warning' })
  }

  return (
    <main className="relative overflow-hidden">
      <Snowfall />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pt-12 pb-20 sm:px-6">
        <SectionHeading
          align="left"
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <HollyIcon size={16} />
              Admin
            </span>
          }
          title={<GradientText as="span">Announcement composer</GradientText>}
          description="Post match-day news, pin the important stuff to the top of the noticeboard, and keep drafts under wraps until they're ready."
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            variant="festive"
            onClick={() => {
              setErrors({})
              setServerError(null)
              setEditor({ ...EMPTY_EDITOR })
            }}
          >
            <span className="inline-flex items-center gap-2">
              <SparkleIcon size={16} />
              New announcement
            </span>
          </Button>
          <Button variant="ghost" href="/announcements">
            View public feed →
          </Button>
          <span className="ml-auto flex flex-wrap gap-2">
            <Badge status="approved">{publishedCount} published</Badge>
            <Badge status="pending">{draftCount} draft{draftCount === 1 ? '' : 's'}</Badge>
          </span>
        </div>

        {demoMode && (
          <div className="mt-6">
            <AlertBanner variant="info">
              <span className="flex items-start gap-2">
                <GiftIcon size={18} className="mt-0.5 shrink-0" />
                <span>
                  <strong>Demo mode.</strong> No Supabase project is connected, so nothing here is
                  saved. Create, edit, pin and publish away — the changes live in this browser tab
                  only and vanish on refresh. 🎄
                </span>
              </span>
            </AlertBanner>
          </div>
        )}

        {serverError && (
          <div className="mt-6">
            <AlertBanner>{serverError}</AlertBanner>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="tablist"
            aria-label="Filter announcements by status"
            className="inline-flex rounded-[var(--radius-pill)] bg-white/70 p-1 shadow-[var(--shadow-soft)]"
          >
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={status === tab.id}
                onClick={() => setStatus(tab.id)}
                className={cn(
                  'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-extrabold transition',
                  status === tab.id
                    ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-soft)]'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-plum)]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="sm:ml-auto sm:w-72">
            <label htmlFor="announcement-search" className="sr-only">
              Search announcements
            </label>
            <input
              id="announcement-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and bodies…"
              className="w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-sm text-[var(--color-plum)] shadow-[var(--shadow-soft)] placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {visible.length === 0 ? (
            <EmptyState
              icon={<ShuttlecockIcon size={40} className="text-[var(--color-brand-lilac)]" />}
              title={
                items.length === 0
                  ? 'Quiet on the court — no announcements yet 🎄'
                  : 'Nothing matches that filter'
              }
              description={
                items.length === 0
                  ? 'Write the first notice and give the noticeboard some tinsel.'
                  : 'Try a different search or switch back to All.'
              }
              action={
                items.length === 0 ? (
                  <Button variant="festive" onClick={() => setEditor({ ...EMPTY_EDITOR })}>
                    Write the first one
                  </Button>
                ) : undefined
              }
            />
          ) : (
            visible.map((announcement) => {
              const accent = ACCENT_STYLES[accentForAnnouncement(announcement.id)]
              const busy = busyId === announcement.id
              return (
                <Card
                  key={announcement.id}
                  variant={announcement.isPinned ? 'candy-stripe' : 'default'}
                  className="relative overflow-hidden"
                >
                  <CardBody className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <BaubleIcon size={18} className={accent.text} />
                      <Badge status={announcement.isPublished ? 'approved' : 'pending'}>
                        {announcement.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      {announcement.isPinned && <Badge status="live">📌 Pinned</Badge>}
                      <span className="ml-auto text-xs font-semibold text-[var(--color-ink-muted)]">
                        {formatAnnouncementDateTime(announcement.createdAt)}
                      </span>
                    </div>

                    <h2 className="mt-3 text-lg font-extrabold text-[var(--color-plum)]">
                      {announcement.title}
                    </h2>
                    <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                      {excerpt(announcement.body, 180)}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setErrors({})
                          setServerError(null)
                          setEditor({
                            id: announcement.id,
                            title: announcement.title,
                            body: announcement.body,
                            isPinned: announcement.isPinned,
                            isPublished: announcement.isPublished,
                          })
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy}
                        onClick={() =>
                          patch(
                            announcement,
                            { isPinned: !announcement.isPinned },
                            announcement.isPinned ? 'Unpinned' : 'Pinned to the top 📌',
                          )
                        }
                      >
                        {announcement.isPinned ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy}
                        onClick={() =>
                          patch(
                            announcement,
                            { isPublished: !announcement.isPublished },
                            announcement.isPublished ? 'Moved back to drafts' : 'Published 🎉',
                          )
                        }
                      >
                        {announcement.isPublished ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className="ml-auto"
                        onClick={() => setPendingDelete(announcement)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )
            })
          )}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--color-ink-muted)]">
          Published notices appear on{' '}
          <Link href="/announcements" className="font-bold underline underline-offset-4">
            /announcements
          </Link>{' '}
          and on the courtside TV rotation. Drafts stay here.
        </p>
      </div>

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Edit announcement' : 'New announcement'}
        description="Markdown supported: # headings, - bullets and **bold**."
        className="max-w-3xl!"
      >
        {editor && (
          <form onSubmit={handleSave}>
            <TextField
              label="Title"
              required
              value={editor.title}
              error={errors.title}
              maxLength={140}
              placeholder="📣 Call room opens 8:30am"
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="announcement-body"
                  className="mb-1.5 block text-sm font-semibold text-[var(--color-plum)]"
                >
                  Body <span className="text-[var(--color-brand-pink-dark)]">*</span>
                </label>
                <textarea
                  id="announcement-body"
                  rows={10}
                  value={editor.body}
                  aria-invalid={!!errors.body}
                  placeholder={BODY_PLACEHOLDER}
                  onChange={(event) => setEditor({ ...editor, body: event.target.value })}
                  className={cn(
                    'w-full rounded-[var(--radius-md)] border bg-white px-4 py-2.5 font-mono text-sm text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none',
                    errors.body
                      ? 'border-[var(--color-danger)]'
                      : 'border-[var(--color-brand-lilac-light)]',
                  )}
                />
                {errors.body && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[var(--color-danger)]">
                    {errors.body}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-plum)]">
                  <SparkleIcon size={14} className="text-[var(--color-brand-gold-dark)]" />
                  Live preview
                </p>
                <div className="h-[15.5rem] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white/80 px-4 py-3">
                  <h3 className="text-lg font-extrabold text-[var(--color-plum)]">
                    {editor.title.trim() || 'Your title will appear here'}
                  </h3>
                  {editor.body.trim() ? (
                    <Markdown
                      content={editor.body}
                      className="text-sm text-[var(--color-ink-soft)]"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                      Start typing and the notice will take shape here. 🎄
                    </p>
                  )}
                </div>
              </div>
            </div>

            <fieldset className="mt-4 flex flex-wrap gap-4 rounded-[var(--radius-md)] bg-white/70 p-3">
              <legend className="sr-only">Visibility</legend>
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-soft)]">
                <input
                  type="checkbox"
                  checked={editor.isPublished}
                  onChange={(event) => setEditor({ ...editor, isPublished: event.target.checked })}
                  className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                />
                Published (visible to everyone)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-soft)]">
                <input
                  type="checkbox"
                  checked={editor.isPinned}
                  onChange={(event) => setEditor({ ...editor, isPinned: event.target.checked })}
                  className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                />
                Pin to the top of the noticeboard
              </label>
            </fieldset>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="festive" loading={saving}>
                {editor.id ? 'Save changes' : 'Post announcement'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this announcement?"
        description="This can't be undone — the notice disappears from the public feed and the TV rotation."
      >
        <p className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm font-semibold text-[var(--color-danger)]">
          {pendingDelete?.title}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
            Keep it
          </Button>
          <Button variant="danger" loading={busyId === pendingDelete?.id} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </main>
  )
}
