'use server'

import { revalidatePath } from 'next/cache'

import type { Json } from '@/lib/supabase/types'
import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { SiteContentRow } from '@/lib/supabase/types'
import {
  analyseRoleChange,
  buildAuditEntry,
  diffCourts,
  describeLiveStatus,
  diffDetails,
  diffLiveStatus,
  diffDivisions,
  diffPrizes,
  diffTimeSlots,
  divisionExtras,
  divisionRowPatch,
  hasErrors,
  ROLE_LABELS,
  validateCourts,
  validateDivision,
  validatePrizes,
  validateTimeSlots,
  validateLiveStatus,
  validateTournamentDetails,
  type AssignableRole,
  type CourtSettings,
  type LiveStatus,
  type DivisionSettings,
  type PrizeSettings,
  type SettingsChange,
  type SettingsIssue,
  type TimeSlotSettings,
  type TournamentDetails,
} from '@/lib/settings'
import { loadSettingsPageData, PRIZES_SLUG, SETTINGS_EXTRAS_SLUG } from './data'

/**
 * Server Actions for `/admin/settings`.
 *
 * Every action:
 *   1. re-checks `requireAdmin()` (never trust the client),
 *   2. re-runs the same pure validators the form used,
 *   3. writes the change, then
 *   4. appends an `audit_log` row describing exactly what moved.
 *
 * In demo mode (no Supabase env vars) they validate and return
 * `demo: true` instead of writing, so the console is fully clickable in CI
 * and the preview deploy without ever throwing.
 */

const SETTINGS_PATH = '/admin/settings'

/**
 * Demo mode has no auth system at all, so `requireAdmin()` would bounce every
 * caller to `/login` and make the console unreviewable in CI. There is also
 * nothing to protect: every demo action is a no-op. The guard is fully live
 * the moment Supabase is configured.
 */
async function ensureAdmin(): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null
  return await requireAdmin(SETTINGS_PATH)
}

export interface ActionResult {
  ok: boolean
  demo?: boolean
  message: string
  issues?: SettingsIssue[]
  changes?: SettingsChange[]
}

function invalid(issues: SettingsIssue[]): ActionResult {
  return {
    ok: false,
    message: 'Some values need another look before this can be saved.',
    issues,
  }
}

function noChanges(): ActionResult {
  return { ok: true, message: 'Nothing to save — everything already matches.', changes: [] }
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

async function writeAudit(
  supabase: SupabaseLike,
  actorId: string,
  entry: ReturnType<typeof buildAuditEntry>,
): Promise<void> {
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    metadata: entry.metadata as unknown as Json,
  })
}

/** Read-modify-write of the JSON blob in `site_content` (no columns exist yet). */
async function mergeExtras(
  supabase: SupabaseLike,
  slug: string,
  title: string,
  mutate: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const { data } = await supabase.from('site_content').select('*').eq('slug', slug).maybeSingle()
  let current: Record<string, unknown> = {}
  const body = (data as SiteContentRow | null)?.body_markdown
  if (body) {
    try {
      current = JSON.parse(body) as Record<string, unknown>
    } catch {
      current = {}
    }
  }

  await supabase.from('site_content').upsert({
    slug,
    title,
    body_markdown: JSON.stringify(mutate(current), null, 2),
    is_published: false,
  })
}

// ---------------------------------------------------------------------------
// Tournament details
// ---------------------------------------------------------------------------

export async function saveTournamentDetailsAction(details: TournamentDetails): Promise<ActionResult> {
  await ensureAdmin()

  const issues = validateTournamentDetails(details)
  if (hasErrors(issues)) return invalid(issues)

  const current = await loadSettingsPageData()
  const changes = diffDetails(current.settings.details, details)
  if (changes.length === 0) return noChanges()

  if (!isSupabaseConfigured() || !current.tournamentId) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — your changes validated perfectly but there is no database to save them to.',
      changes,
      issues,
    }
  }

  const supabase = await createClient()
  const user = await requireAdmin(SETTINGS_PATH)

  const { error } = await supabase
    .from('tournaments')
    .update({
      name: details.name.trim(),
      tournament_date: details.tournamentDate,
      registration_opens_at: details.registrationOpensAt,
      registration_closes_at: details.registrationClosesAt,
      venue_name: details.venueName.trim() || null,
      venue_address: details.venueAddress.trim() || null,
      description: details.description.trim() || null,
    })
    .eq('id', current.tournamentId)

  if (error) return { ok: false, message: `Could not save: ${error.message}` }

  await mergeExtras(supabase, SETTINGS_EXTRAS_SLUG, 'Tournament settings extras', (blob) => ({
    ...blob,
    details: {
      contactName: details.contactName.trim(),
      contactEmail: details.contactEmail.trim(),
      contactPhone: details.contactPhone.trim(),
      registrationCloseConfirmed: details.registrationCloseConfirmed,
    },
  }))

  await writeAudit(
    supabase,
    user.id,
    buildAuditEntry('settings.details.update', 'tournament', current.tournamentId, changes),
  )

  revalidatePath(SETTINGS_PATH)
  revalidatePath('/')
  return { ok: true, message: 'Tournament details saved. Ho ho ho!', changes, issues }
}

// ---------------------------------------------------------------------------
// Divisions + rules (same table, two screens)
// ---------------------------------------------------------------------------

async function saveDivisions(
  divisions: DivisionSettings[],
  action: 'settings.divisions.update' | 'settings.rules.update',
  successMessage: string,
): Promise<ActionResult> {
  await ensureAdmin()

  const issues = divisions.flatMap((division) => validateDivision(division, divisions))
  if (hasErrors(issues)) return invalid(issues)
  if (!divisions.some((division) => division.enabled)) {
    return invalid([
      { path: 'divisions', message: 'At least one division must stay enabled.', severity: 'error' },
    ])
  }

  const current = await loadSettingsPageData()
  const changes = diffDivisions(current.settings.divisions, divisions)
  if (changes.length === 0) return noChanges()

  if (!isSupabaseConfigured() || !current.tournamentId) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — validated and diffed, but there is no database to save to.',
      changes,
      issues,
    }
  }

  const supabase = await createClient()
  const user = await requireAdmin(SETTINGS_PATH)

  for (const division of divisions) {
    const patch = divisionRowPatch(division)
    const known = current.settings.divisions.some((d) => d.id === division.id)
    const { error } = known
      ? await supabase.from('divisions').update(patch).eq('id', division.id)
      : await supabase.from('divisions').insert({
          ...patch,
          tournament_id: current.tournamentId,
          gender: division.gender,
        })
    if (error) return { ok: false, message: `Could not save ${division.name}: ${error.message}` }
  }

  const removed = current.settings.divisions.filter((d) => !divisions.some((next) => next.id === d.id))
  for (const division of removed) {
    const { error } = await supabase.from('divisions').delete().eq('id', division.id)
    if (error) {
      return {
        ok: false,
        message: `Could not remove ${division.name} (it probably has entries or matches): ${error.message}`,
      }
    }
  }

  await mergeExtras(supabase, SETTINGS_EXTRAS_SLUG, 'Tournament settings extras', (blob) => ({
    ...blob,
    divisions: Object.fromEntries(divisions.map((division) => [division.id, divisionExtras(division)])),
  }))

  await writeAudit(supabase, user.id, buildAuditEntry(action, 'division', current.tournamentId, changes))

  revalidatePath(SETTINGS_PATH)
  revalidatePath('/rules')
  return { ok: true, message: successMessage, changes, issues }
}

export async function saveDivisionsAction(divisions: DivisionSettings[]): Promise<ActionResult> {
  return saveDivisions(divisions, 'settings.divisions.update', 'Divisions saved. Let them enter!')
}

export async function saveRulesAction(divisions: DivisionSettings[]): Promise<ActionResult> {
  return saveDivisions(divisions, 'settings.rules.update', 'Rules saved. The draw engine is already using them.')
}

// ---------------------------------------------------------------------------
// Courts + time slots
// ---------------------------------------------------------------------------

export async function saveCourtsAndSlotsAction(input: {
  courts: CourtSettings[]
  timeSlots: TimeSlotSettings[]
}): Promise<ActionResult> {
  await ensureAdmin()

  const issues = [...validateCourts(input.courts), ...validateTimeSlots(input.timeSlots)]
  if (hasErrors(issues)) return invalid(issues)

  const current = await loadSettingsPageData()
  const changes = [
    ...diffCourts(current.settings.courts, input.courts),
    ...diffTimeSlots(current.settings.timeSlots, input.timeSlots),
  ]
  if (changes.length === 0) return noChanges()

  if (!isSupabaseConfigured() || !current.tournamentId) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — courts and slots validated, but nothing was written.',
      changes,
      issues,
    }
  }

  const supabase = await createClient()
  const user = await requireAdmin(SETTINGS_PATH)
  const tournamentId = current.tournamentId

  for (const court of input.courts) {
    const known = current.settings.courts.some((c) => c.id === court.id)
    const { error } = known
      ? await supabase
          .from('courts')
          .update({ name: court.name.trim(), sort_order: court.sortOrder })
          .eq('id', court.id)
      : await supabase
          .from('courts')
          .insert({ tournament_id: tournamentId, name: court.name.trim(), sort_order: court.sortOrder })
    if (error) return { ok: false, message: `Could not save ${court.name}: ${error.message}` }
  }
  for (const court of current.settings.courts) {
    if (input.courts.some((c) => c.id === court.id)) continue
    const { error } = await supabase.from('courts').delete().eq('id', court.id)
    if (error) return { ok: false, message: `Could not remove ${court.name}: ${error.message}` }
  }

  for (const slot of input.timeSlots) {
    const known = current.settings.timeSlots.some((s) => s.id === slot.id)
    const payload = {
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      label: slot.label.trim() || null,
    }
    const { error } = known
      ? await supabase.from('time_slots').update(payload).eq('id', slot.id)
      : await supabase.from('time_slots').insert({ ...payload, tournament_id: tournamentId })
    if (error) return { ok: false, message: `Could not save ${slot.label || 'a time slot'}: ${error.message}` }
  }
  for (const slot of current.settings.timeSlots) {
    if (input.timeSlots.some((s) => s.id === slot.id)) continue
    const { error } = await supabase.from('time_slots').delete().eq('id', slot.id)
    if (error) return { ok: false, message: `Could not remove ${slot.label || 'a time slot'}: ${error.message}` }
  }

  await writeAudit(
    supabase,
    user.id,
    buildAuditEntry('settings.courts_slots.update', 'tournament', tournamentId, changes),
  )

  revalidatePath(SETTINGS_PATH)
  revalidatePath('/schedule')
  return { ok: true, message: 'Courts and time slots saved. The scheduler is ready.', changes, issues }
}

// ---------------------------------------------------------------------------
// Prizes / loot bags
// ---------------------------------------------------------------------------

export async function savePrizesAction(prizes: PrizeSettings): Promise<ActionResult> {
  await ensureAdmin()

  const current = await loadSettingsPageData()
  const issues = validatePrizes(prizes, current.settings.divisions)
  if (hasErrors(issues)) return invalid(issues)

  const changes = diffPrizes(current.settings.prizes, prizes)
  if (changes.length === 0) return noChanges()

  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — the loot bags are imaginary for now.',
      changes,
      issues,
    }
  }

  const supabase = await createClient()
  const user = await requireAdmin(SETTINGS_PATH)

  await mergeExtras(supabase, PRIZES_SLUG, 'Prizes and loot bag configuration', () => ({
    ...prizes,
  }))

  await writeAudit(
    supabase,
    user.id,
    buildAuditEntry('settings.prizes.update', 'tournament', current.tournamentId, changes),
  )

  revalidatePath(SETTINGS_PATH)
  return { ok: true, message: 'Prizes and loot bags saved. Santa approves.', changes, issues }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleActionResult extends ActionResult {
  warning?: string
}

export async function updateRoleAction(input: {
  targetUserId: string
  role: AssignableRole
  action: 'grant' | 'revoke'
}): Promise<RoleActionResult> {
  const actor = await ensureAdmin()
  const current = await loadSettingsPageData()
  const actorId = current.isDemo ? (current.currentUserId ?? actor?.id ?? '') : (actor?.id ?? '')

  const verdict = analyseRoleChange({
    actorUserId: actorId,
    targetUserId: input.targetUserId,
    role: input.role,
    action: input.action,
    users: current.users,
  })

  if (!verdict.allowed) {
    return { ok: false, message: verdict.blockedReason ?? 'That role change is not allowed.' }
  }

  const target = current.users.find((user) => user.id === input.targetUserId)
  const label = ROLE_LABELS[input.role]
  const verb = input.action === 'grant' ? 'now has' : 'no longer has'
  const changes: SettingsChange[] = [
    {
      path: `roles.${input.targetUserId}.${input.role}`,
      label: `${target?.fullName ?? 'User'} · ${label}`,
      before: input.action === 'grant' ? 'off' : 'on',
      after: input.action === 'grant' ? 'on' : 'off',
    },
  ]

  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      demo: true,
      message: `Demo mode — ${target?.fullName ?? 'that user'} would ${verb} the ${label} role.`,
      warning: verdict.warning,
      changes,
    }
  }

  const supabase = await createClient()
  const { error } =
    input.action === 'grant'
      ? await supabase
          .from('user_roles')
          .insert({ user_id: input.targetUserId, role: input.role, granted_by: (actor?.id ?? '') })
      : await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', input.targetUserId)
          .eq('role', input.role)

  if (error) return { ok: false, message: `Could not update the role: ${error.message}` }

  await writeAudit(
    supabase,
    actorId,
    buildAuditEntry(`settings.role.${input.action}`, 'user_role', input.targetUserId, changes, {
      role: input.role,
    }),
  )

  revalidatePath(SETTINGS_PATH)
  return {
    ok: true,
    message: `${target?.fullName ?? 'That user'} ${verb} the ${label} role.`,
    warning: verdict.warning,
    changes,
  }
}

// ---------------------------------------------------------------------------
// Going live
// ---------------------------------------------------------------------------

/**
 * Publishes the tournament and opens/closes the registration sheet.
 *
 * This is the button the go-live runbook asks for. Without it the two columns
 * that decide whether the public site shows anything real could only be
 * changed by hand-writing SQL, which meant a committee could finish setup and
 * still have a site that told every player registration was closed.
 */
export async function saveLiveStatusAction(status: LiveStatus): Promise<ActionResult> {
  const admin = await ensureAdmin()

  const issues = validateLiveStatus(status)
  if (hasErrors(issues)) return invalid(issues)

  const current = await loadSettingsPageData()
  const changes = diffLiveStatus(current.liveStatus, status)
  if (changes.length === 0) return noChanges()

  if (!isSupabaseConfigured() || !current.tournamentId) {
    return {
      ok: true,
      demo: true,
      message: 'Demo mode — there is no tournament row to publish.',
      changes,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tournaments')
    .update({ is_published: status.isPublished, is_registration_open: status.isRegistrationOpen })
    .eq('id', current.tournamentId)

  if (error) return { ok: false, message: `Could not save: ${error.message}`, changes }

  if (admin) {
    await writeAudit(
      supabase,
      admin.id,
      buildAuditEntry('tournament.live_status', 'tournament', current.tournamentId, changes),
    )
  }

  revalidatePath(SETTINGS_PATH)
  revalidatePath('/')
  revalidatePath('/register')

  return { ok: true, message: describeLiveStatus(status), changes }
}
