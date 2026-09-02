'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth'
import { withDemoHint } from '@/lib/demo-mode'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import {
  isManageableRole,
  ROLE_LABELS,
  roleChangeBlocker,
  roleChangeBlockerMessage,
} from '@/lib/people'

const PEOPLE_PATH = '/admin/people'

export interface RoleActionResult {
  ok: boolean
  message: string
  /** True when nothing was written because Supabase isn't configured. */
  demo?: boolean
}

/**
 * Grant or revoke one role for one account.
 *
 * The client disables buttons it knows will be refused, but a Server Action is
 * a public POST endpoint, so every check is repeated here against freshly read
 * state. In particular the admin list is re-queried rather than trusted from
 * the form: the client's copy is as old as its last render, and two admins
 * demoting each other from stale pages could otherwise empty the committee.
 *
 * RLS (`user_roles_admin_write`) is the final backstop, but it only knows
 * "is an admin doing this" — it cannot express "and at least one admin must
 * survive", which is the rule that actually matters here.
 */
export async function setUserRoleAction(formData: FormData): Promise<RoleActionResult> {
  const targetId = String(formData.get('userId') ?? '')
  const role = String(formData.get('role') ?? '')
  const grant = String(formData.get('grant') ?? '') === 'true'

  if (!targetId || !isManageableRole(role)) {
    return { ok: false, message: roleChangeBlockerMessage('not-manageable') }
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      demo: true,
      message: withDemoHint('Demo mode — role changes need a database, so nothing was saved.'),
    }
  }

  const actor = await requireAdmin(PEOPLE_PATH)
  const supabase = await createClient()

  const { data: adminRows, error: adminError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')

  if (adminError) {
    return { ok: false, message: `Could not check who the admins are: ${adminError.message}` }
  }

  const blocker = roleChangeBlocker({
    actorId: actor.id,
    targetId,
    role,
    grant,
    currentAdminIds: (adminRows ?? []).map((row) => row.user_id),
  })

  if (blocker) return { ok: false, message: roleChangeBlockerMessage(blocker) }

  const { label } = ROLE_LABELS[role]

  if (grant) {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: targetId, role, granted_by: actor.id }, { onConflict: 'user_id,role' })

    if (error) return { ok: false, message: `Could not grant ${label}: ${error.message}` }
  } else {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', targetId)
      .eq('role', role)

    if (error) return { ok: false, message: `Could not remove ${label}: ${error.message}` }
  }

  await writeAudit(supabase, actor.id, targetId, role, grant)

  revalidatePath(PEOPLE_PATH)

  return {
    ok: true,
    message: grant ? `${label} granted.` : `${label} removed.`,
  }
}

/**
 * Record the change. Role grants are the most security-relevant thing this
 * console does, so they are worth a trail — but a failure to log must never
 * undo a change that has already happened.
 */
async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  targetId: string,
  role: string,
  grant: boolean
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      actor_id: actorId,
      action: grant ? 'role.grant' : 'role.revoke',
      entity_type: 'user_role',
      entity_id: targetId,
      metadata: { role },
    })
  } catch {
    // Deliberately swallowed — see the doc comment.
  }
}
