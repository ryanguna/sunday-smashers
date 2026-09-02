'use client'

import { useMemo, useState, useTransition } from 'react'

import { Badge, Button, Card, useToast } from '@/components/ui'
import { SparkleIcon } from '@/components/icons'
import { initials } from '@/lib/admin'
import {
  filterPeople,
  MANAGEABLE_ROLES,
  ROLE_LABELS,
  roleChangeBlocker,
  roleChangeBlockerMessage,
  sortPeople,
  type ManageableRole,
  type PersonRoles,
} from '@/lib/people'
import { setUserRoleAction } from '@/app/admin/people/actions'

/**
 * The roles desk: see every account and change what each one may do.
 *
 * Roles are toggled one at a time with an immediate write rather than an
 * edit-then-save form. Access changes are rare, deliberate and usually
 * singular ("make Marcus an admin"), and a batch form invites the far worse
 * failure of someone unticking several boxes and saving without reading.
 */

interface Props {
  people: PersonRoles[]
  adminUserIds: string[]
  currentUserId: string | null
  readOnly: boolean
}

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function PeopleClient({ people, adminUserIds, currentUserId, readOnly }: Props) {
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const toast = useToast()

  const visible = useMemo(() => sortPeople(filterPeople(people, search)), [people, search])

  function toggle(person: PersonRoles, role: ManageableRole, grant: boolean) {
    const blocker = roleChangeBlocker({
      actorId: currentUserId ?? '',
      targetId: person.userId,
      role,
      grant,
      currentAdminIds: adminUserIds,
    })

    // Checked here purely for a fast, specific message — the Server Action
    // repeats every one of these against freshly read state.
    if (blocker) {
      toast.toast({ title: roleChangeBlockerMessage(blocker), variant: 'warning' })
      return
    }

    const key = `${person.userId}:${role}`
    setBusyKey(key)

    startTransition(async () => {
      const form = new FormData()
      form.set('userId', person.userId)
      form.set('role', role)
      form.set('grant', String(grant))

      const result = await setUserRoleAction(form)
      setBusyKey(null)

      toast.toast({
        title: result.ok ? `${person.fullName}: ${result.message}` : result.message,
        variant: result.ok ? 'success' : 'danger',
      })
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <label className="flex-1 min-w-[12rem]">
          <span className="sr-only">Search accounts</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, nickname or email"
            className="w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2 text-sm text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:outline-none"
          />
        </label>
        <p aria-live="polite" className="text-sm text-[var(--color-ink-soft)]">
          {visible.length} of {people.length} {people.length === 1 ? 'account' : 'accounts'}
        </p>
      </Card>

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-[var(--color-ink-soft)]">
          Nobody matches “{search}”. Try a shorter search.
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((person) => {
            const isSelf = person.userId === currentUserId
            return (
              <li key={person.userId}>
                <Card className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--gradient-candy)] font-[family-name:var(--font-heading)] text-sm font-bold text-white"
                  >
                    {initials(person.fullName)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-ink)]">
                      {person.fullName}
                      {person.nickname && (
                        <span className="text-sm font-normal text-[var(--color-ink-soft)]">
                          “{person.nickname}”
                        </span>
                      )}
                      {isSelf && <Badge status="info">You</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-[var(--color-ink-soft)]">
                      {person.email ?? 'No email on file'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      Joined {joinedLabel(person.joinedAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {MANAGEABLE_ROLES.map((role) => {
                    const held = person.roles.includes(role)
                    const blocker = roleChangeBlocker({
                      actorId: currentUserId ?? '',
                      targetId: person.userId,
                      role,
                      grant: !held,
                      currentAdminIds: adminUserIds,
                    })
                    const key = `${person.userId}:${role}`
                    const busy = busyKey === key && pending
                    const disabled = readOnly || busy || blocker !== null

                    return (
                      <Button
                        key={role}
                        type="button"
                        size="sm"
                        variant={held ? 'primary' : 'ghost'}
                        disabled={disabled}
                        aria-pressed={held}
                        title={
                          blocker
                            ? roleChangeBlockerMessage(blocker)
                            : ROLE_LABELS[role].description
                        }
                        onClick={() => toggle(person, role, !held)}
                      >
                        {busy ? '…' : ROLE_LABELS[role].label}
                      </Button>
                    )
                  })}
                </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Card className="flex items-start gap-3 p-4 text-sm text-[var(--color-ink-soft)]">
        <SparkleIcon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-ink)]">
            What the roles mean
          </p>
          <ul data-testid="role-legend" className="mt-2 flex flex-col gap-1.5">
            {MANAGEABLE_ROLES.map((role) => (
              <li key={role}>
                <strong className="text-[var(--color-ink)]">{ROLE_LABELS[role].label}</strong> —{' '}
                {ROLE_LABELS[role].description}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  )
}
