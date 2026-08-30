'use client'

import { useMemo, useState, useTransition } from 'react'
import { Badge, Button, Confetti, EmptyState } from '@/components/ui'
import { TextField } from '@/components/auth'
import { MedalIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import {
  analyseRoleChange,
  ASSIGNABLE_ROLES,
  countRole,
  ROLE_BLURBS,
  ROLE_LABELS,
  searchUsers,
  type AssignableRole,
  type ManagedUser,
} from '@/lib/settings'
import { SettingsCard, StatPill } from './Chrome'

export interface RoleUpdateResult {
  ok: boolean
  demo?: boolean
  message: string
  warning?: string
}

export interface RolesManagerProps {
  initialUsers: ManagedUser[]
  currentUserId: string | null
  updateRole: (input: {
    targetUserId: string
    role: AssignableRole
    action: 'grant' | 'revoke'
  }) => Promise<RoleUpdateResult>
  readOnly?: boolean
}

/**
 * Role assignment with a live search and the "never lock out the last admin"
 * guard applied optimistically in the UI *and* re-checked in the Server
 * Action — a blocked toggle is disabled with the reason as its tooltip.
 */
export function RolesManager({ initialUsers, currentUserId, updateRole, readOnly = false }: RolesManagerProps) {
  const [users, setUsers] = useState(initialUsers)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<RoleUpdateResult | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [, startTransition] = useTransition()

  const results = useMemo(() => searchUsers(users, query), [users, query])
  const actorId = currentUserId ?? ''

  function toggle(user: ManagedUser, role: AssignableRole) {
    const action = user.roles.includes(role) ? 'revoke' : 'grant'
    const verdict = analyseRoleChange({
      actorUserId: actorId,
      targetUserId: user.id,
      role,
      action,
      users,
    })
    if (!verdict.allowed) {
      setFeedback({ ok: false, message: verdict.blockedReason ?? 'That change is not allowed.' })
      return
    }

    setPending(`${user.id}:${role}`)
    startTransition(async () => {
      const result = await updateRole({ targetUserId: user.id, role, action })
      setPending(null)
      setFeedback(result)
      if (result.ok) {
        setUsers((current) =>
          current.map((row) =>
            row.id === user.id
              ? {
                  ...row,
                  roles:
                    action === 'grant'
                      ? [...row.roles, role]
                      : row.roles.filter((existing) => existing !== role),
                }
              : row,
          ),
        )
        setCelebrate(true)
        setTimeout(() => setCelebrate(false), 2200)
      }
    })
  }

  return (
    <div className="space-y-5">
      <Confetti active={celebrate} count={24} />

      <SettingsCard
        title="Who can do what"
        description="Roles are additive — an admin can do everything a tabulator can."
        icon={<MedalIcon size={20} />}
        tone="lilac"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASSIGNABLE_ROLES.map((role) => (
            <StatPill key={role} label={ROLE_LABELS[role]} value={countRole(users, role)} />
          ))}
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {ASSIGNABLE_ROLES.map((role) => (
            <div key={role} className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-3 text-sm">
              <dt className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                {ROLE_LABELS[role]}
              </dt>
              <dd className="text-[var(--color-ink-soft)]">{ROLE_BLURBS[role]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3 text-sm text-[var(--color-info)]">
          There must always be at least one admin. The last admin role cannot be revoked — grant it to
          somebody else first.
        </p>
      </SettingsCard>

      {feedback && (
        <div
          role="status"
          className={`rounded-[var(--radius-md)] p-3.5 text-sm font-medium ${
            feedback.ok
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
              : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
          }`}
        >
          <p>{feedback.message}</p>
          {feedback.warning && <p className="mt-1 font-bold">{feedback.warning}</p>}
        </div>
      )}

      <SettingsCard
        title="People"
        description="Search by name, nickname, email or role."
        icon={<ShuttlecockIcon size={20} />}
        tone="mint"
        meta={<Badge status="info">{results.length} shown</Badge>}
      >
        <TextField
          label="Search people"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. Nadia, tabulator, @example.com"
        />

        {results.length === 0 ? (
          <EmptyState
            icon={<SparkleIcon size={32} aria-hidden="true" />}
            title="Nobody matches that"
            description="Try a shorter search — or check they have finished onboarding."
          />
        ) : (
          <ul className="space-y-3">
            {results.map((user) => {
              const isSelf = user.id === actorId
              return (
                <li
                  key={user.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white p-3.5"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                        {user.fullName}
                        {user.nickname && (
                          <span className="ml-1.5 font-normal text-[var(--color-ink-muted)]">
                            “{user.nickname}”
                          </span>
                        )}
                        {isSelf && (
                          <Badge status="live" className="ml-2 align-middle">
                            You
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {user.email ?? 'Email hidden — lives in Supabase auth.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const has = user.roles.includes(role)
                      const action = has ? 'revoke' : 'grant'
                      const verdict = analyseRoleChange({
                        actorUserId: actorId,
                        targetUserId: user.id,
                        role,
                        action,
                        users,
                      })
                      const key = `${user.id}:${role}`
                      const blocked = !verdict.allowed && has

                      return (
                        <Button
                          key={role}
                          type="button"
                          size="sm"
                          variant={has ? 'primary' : 'secondary'}
                          aria-pressed={has}
                          loading={pending === key}
                          disabled={readOnly || blocked || pending !== null}
                          title={blocked ? verdict.blockedReason : `${has ? 'Revoke' : 'Grant'} ${ROLE_LABELS[role]}`}
                          onClick={() => toggle(user, role)}
                        >
                          {has ? '✓ ' : '+ '}
                          {ROLE_LABELS[role]}
                        </Button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SettingsCard>
    </div>
  )
}
