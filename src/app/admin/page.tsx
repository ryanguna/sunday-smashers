import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, Card } from '@/components/ui'
import {
  GiftIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'
import { AdminDemoBanner, AdminPageHeader, AlertTile, StatCard } from '@/components/admin/AdminUI'
import { getAdminConsoleData } from '@/components/admin/data'
import {
  buildAlerts,
  capacityState,
  computeReconciliation,
  countByStatus,
  formatCents,
  freeAgents,
  REGISTRATION_STATUS_CHEER,
  REGISTRATION_STATUS_LABELS,
  shirtSizeTally,
  summariseByDivision,
  type CapacityState,
} from '@/lib/admin'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

const CAPACITY_COPY: Record<CapacityState, { label: string; className: string }> = {
  open: { label: 'Plenty of room', className: 'bg-[var(--color-success-bg)] text-[var(--color-success)]' },
  filling: { label: 'Filling up', className: 'bg-[var(--color-info-bg)] text-[var(--color-info)]' },
  'near-full': { label: 'Nearly full', className: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]' },
  full: { label: 'Full', className: 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]' },
  over: { label: 'Over capacity', className: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]' },
}

export default async function AdminDashboardPage() {
  const { divisions, registrations, pendingInvites, isDemo } = await getAdminConsoleData()

  const statusCounts = countByStatus(registrations)
  const summaries = summariseByDivision(registrations, divisions)
  const totals = computeReconciliation(registrations)
  const agents = freeAgents(registrations)
  const alerts = buildAlerts(registrations, divisions, pendingInvites.length)
  const shirts = shirtSizeTally(registrations)
  const collectionPercent = Math.round(totals.collectionRate * 100)

  return (
    <>
      <AdminPageHeader
        eyebrow="Ho ho ho"
        title="Tournament HQ"
        description={`Everything at a glance for ${TOURNAMENT_DATE_LABEL}.`}
        actions={
          <>
            <Badge status="info">
              {registrations.length} registration{registrations.length === 1 ? '' : 's'}
            </Badge>
            <Badge status={totals.outstandingCents === 0 ? 'paid' : 'unpaid'}>
              {formatCents(totals.collectedCents)} in the tin
            </Badge>
          </>
        }
      />

      {isDemo && <AdminDemoBanner />}

      <section aria-labelledby="dash-stats" className="mb-6">
        <h2 id="dash-stats" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total registrations"
            value={registrations.length}
            hint={`${statusCounts.approved} approved · ${statusCounts.pending} pending`}
            tone="pink"
            icon={<ShuttlecockIcon size={20} />}
          />
          <StatCard
            label="Payments collected"
            value={formatCents(totals.collectedCents)}
            hint={`${collectionPercent}% of ${formatCents(totals.expectedCents)} expected`}
            tone="mint"
            icon={<GiftIcon size={20} />}
          />
          <StatCard
            label="Free agents"
            value={agents.length}
            hint="Waiting to be paired up"
            tone="sky"
            icon={<RacketIcon size={20} />}
          />
          <StatCard
            label="Pending invites"
            value={pendingInvites.length}
            hint="Partner invites not yet accepted"
            tone="gold"
            icon={<SparkleIcon size={20} />}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section aria-labelledby="dash-divisions" className="lg:col-span-2">
          <h2
            id="dash-divisions"
            className="mb-2.5 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
          >
            <TrophyIcon size={20} className="text-[var(--color-brand-gold-dark)]" aria-hidden="true" />
            Divisions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {summaries.map((summary) => {
              const state = capacityState(summary.approvedTeams, summary.maxTeams)
              const copy = CAPACITY_COPY[state]
              const fillPercent = Math.min(100, Math.round((summary.fillRatio ?? 0) * 100))
              return (
                <Card key={summary.divisionId} variant="frosted" className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold text-[var(--color-plum)]">
                      {summary.divisionName}
                    </h3>
                    <span
                      className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-bold ${copy.className}`}
                    >
                      {copy.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    <strong className="text-[var(--color-plum)]">{summary.total}</strong> players ·{' '}
                    <strong className="text-[var(--color-plum)]">{summary.approvedTeams}</strong>
                    {summary.maxTeams ? ` of ${summary.maxTeams}` : ''} teams
                  </p>
                  {summary.maxTeams && (
                    <div
                      className="mt-2.5 h-2 w-full overflow-hidden rounded-[var(--radius-pill)] bg-white/70"
                      role="img"
                      aria-label={`${fillPercent}% of team slots filled`}
                    >
                      <div
                        className="h-full rounded-[var(--radius-pill)] bg-[image:var(--gradient-candy)]"
                        style={{ width: `${fillPercent.toFixed(0)}%` }}
                      />
                    </div>
                  )}
                  <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                    {(['pending', 'approved', 'waitlisted', 'rejected'] as const).map((status) => (
                      <div
                        key={status}
                        className="rounded-[var(--radius-sm)] bg-white/70 px-1 py-1.5"
                        title={REGISTRATION_STATUS_CHEER[status]}
                      >
                        <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                          {REGISTRATION_STATUS_LABELS[status]}
                        </dt>
                        <dd className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                          {summary.byStatus[status]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              )
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <section aria-labelledby="dash-shirts">
            <h2
              id="dash-shirts"
              className="mb-2.5 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
            >
              <MedalIcon size={20} className="text-[var(--color-brand-pink-dark)]" aria-hidden="true" />
              Loot bag shirt sizes
            </h2>
            <Card variant="frosted" className="p-4">
              <div className="flex flex-wrap gap-2">
                {shirts.map((entry) => (
                  <span
                    key={entry.size}
                    className="rounded-[var(--radius-pill)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)]"
                  >
                    {entry.size}
                    <span className="ml-1.5 rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-light)] px-2 py-0.5 text-xs font-extrabold text-[var(--color-brand-mint-dark)]">
                      {entry.count}
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
                Excludes rejected entries. Export the full list from{' '}
                <Link href="/admin/registrations" className="font-bold underline underline-offset-2">
                  Registrations
                </Link>
                .
              </p>
            </Card>
          </section>

            <section aria-labelledby="dash-pairing">
            <h2
              id="dash-pairing"
              className="mb-2.5 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
            >
              <RacketIcon size={20} className="text-[var(--color-brand-lilac-dark)]" aria-hidden="true" />
              Pairing queue
            </h2>
            <Card variant="frosted" className="p-4">
              {agents.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Everyone has a partner. Christmas miracle. ✨
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {agents.slice(0, 6).map((agent) => (
                    <li
                      key={agent.id}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-white/70 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--color-plum)]">
                          {agent.playerName}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-ink-muted)]">
                          {agent.divisionName}
                        </span>
                      </span>
                      <Badge status={agent.status === 'approved' ? 'approved' : 'pending'}>
                        {REGISTRATION_STATUS_LABELS[agent.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
                Pairing free agents into teams lives on the{' '}
                <Link href="/admin/teams" className="font-bold underline underline-offset-2">
                  Teams
                </Link>{' '}
                page (coming soon — see the handover notes).
              </p>
            </Card>
          </section>
          </div>
        </section>

        <section aria-labelledby="dash-alerts">
          <h2
            id="dash-alerts"
            className="mb-2.5 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
          >
            <SnowflakeIcon
              size={20}
              className="animate-twinkle text-[var(--color-brand-sky-dark)] [animation-duration:4s]"
              aria-hidden="true"
            />
            Needs your attention
          </h2>
          <div className="flex flex-col gap-2.5">
            {alerts.map((alert) => (
              <AlertTile
                key={alert.id}
                tone={alert.tone}
                title={alert.title}
                detail={alert.detail}
                href={alert.href}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
