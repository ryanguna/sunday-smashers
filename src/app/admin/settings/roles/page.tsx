import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { DemoModeNotice } from '@/components/auth'
import { RolesManager } from '@/components/settings'
import { loadSettingsPageData } from '../data'
import { updateRoleAction } from '../actions'

export default async function SettingsRolesPage() {
  // Demo mode has no auth system at all (and no real data to protect), so the
  // console stays reviewable in CI. The guard is live the moment Supabase is.
  if (isSupabaseConfigured()) await requireAdmin('/admin/settings/roles')
  const { users, currentUserId, isDemo } = await loadSettingsPageData()

  return (
    <div className="space-y-5">
      {isDemo && <DemoModeNotice what="Saving role changes" />}
      <RolesManager initialUsers={users} currentUserId={currentUserId} updateRole={updateRoleAction} />
    </div>
  )
}
