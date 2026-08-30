'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Badge,
  Button,
  Card,
  CardBody,
  Modal,
  Tabs,
  ToastProvider,
  useToast,
} from '@/components/ui'
import { MedalIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { AdminPageHeader, StatCard } from '@/components/admin/AdminUI'
import { WinnersShowcase } from '@/components/awards'
import { cn } from '@/lib/cn'
import {
  awardDefinitionByKey,
  buildDivisionViews,
  pendingConfirmations,
  placingsConfirmed,
  planPublish,
  publishedAwards,
  recipientLabel,
  sortAwards,
  type AwardDefinition,
  type AwardRecord,
} from '@/lib/awards'
import type { PublicTeam } from '@/lib/public-data'
import type { AdminDivisionAwards } from './data'
import {
  confirmPlacingsAction,
  deleteAwardAction,
  saveAwardAction,
  setPublishedAction,
  type SaveAwardInput,
} from './actions'

/**
 * The awards console. Placing awards arrive pre-filled from
 * `finalPlacings()` — the admin confirms rather than types — and everything
 * stays hidden from the public until it is explicitly published.
 */

const inputClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] shadow-sm focus:border-[var(--color-brand-lilac)] focus:outline-none'

interface DraftPatch {
  teamId: string | null
  playerId: string | null
  citation: string
}

function draftOf(record: AwardRecord): DraftPatch {
  return {
    teamId: record.recipient.teamId,
    playerId: record.recipient.playerId,
    citation: record.citation,
  }
}

function toInput(
  record: AwardRecord,
  draft: DraftPatch,
  definition: AwardDefinition | null,
  isPublished: boolean,
): SaveAwardInput {
  const scope = definition?.scope ?? 'team'
  return {
    id: record.id,
    divisionSlug: record.divisionSlug,
    awardKey: record.key,
    dbType: record.dbType,
    teamId: draft.teamId,
    playerId: scope === 'player' ? draft.playerId : null,
    citation: draft.citation,
    isPublished,
  }
}

function AwardRowEditor({
  record,
  definition,
  teams,
  busy,
  onSave,
  onDelete,
}: {
  record: AwardRecord
  definition: AwardDefinition | null
  teams: readonly PublicTeam[]
  busy: boolean
  onSave: (input: SaveAwardInput) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<DraftPatch>(() => draftOf(record))
  const scope = definition?.scope ?? 'team'
  const players = useMemo(
    () => teams.flatMap((team) => team.players.map((player) => ({ ...player, teamId: team.id, teamName: team.name }))),
    [teams],
  )

  const saved = record.id != null
  const filled = draft.teamId != null || draft.playerId != null

  return (
    <Card
      variant={record.derived && !saved ? 'outline' : 'frosted'}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]',
            record.key === 'champion'
              ? 'bg-[image:var(--gradient-gold)] text-white'
              : 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]'
          )}
          aria-hidden="true"
        >
          {record.key === 'champion' ? <TrophyIcon size={18} /> : <MedalIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="font-[family-name:var(--font-heading)] font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            {definition?.label ?? record.key}
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {definition?.blurb ?? 'Committee award.'}
          </p>
        </div>
        {record.derived && !saved && <Badge status="pending">Derived — confirm</Badge>}
        {saved && <Badge status={record.isPublished ? 'approved' : 'pending'}>
          {record.isPublished ? 'Published' : 'Hidden'}
        </Badge>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Pair</span>
          <select
            className={inputClasses}
            value={draft.teamId ?? ''}
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({ ...current, teamId: event.target.value || null }))
            }
          >
            <option value="">— No pair —</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        {scope === 'player' && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Player</span>
            <select
              className={inputClasses}
              value={draft.playerId ?? ''}
              disabled={busy}
              onChange={(event) => {
                const playerId = event.target.value || null
                const player = players.find((entry) => entry.id === playerId)
                setDraft((current) => ({
                  ...current,
                  playerId,
                  teamId: player?.teamId ?? current.teamId,
                }))
              }}
            >
              <option value="">— No player —</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} · {player.teamName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">
          Citation <span className="font-normal text-[var(--color-ink-muted)]">(optional, shown publicly)</span>
        </span>
        <input
          className={inputClasses}
          value={draft.citation}
          maxLength={200}
          disabled={busy}
          placeholder="Unbeaten in the round robin and ice-cold in the final."
          onChange={(event) => setDraft((current) => ({ ...current, citation: event.target.value }))}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !filled}
          onClick={() => onSave(toInput(record, draft, definition, record.isPublished))}
        >
          {saved ? 'Save changes' : 'Confirm award'}
        </Button>
        {saved && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onSave(toInput(record, draft, definition, !record.isPublished))}
          >
            {record.isPublished ? 'Hide from public' : 'Publish this one'}
          </Button>
        )}
        {saved && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete}>
            Remove
          </Button>
        )}
        {!filled && (
          <span className="text-xs text-[var(--color-ink-muted)]">Pick a recipient first.</span>
        )}
      </div>
    </Card>
  )
}

function DivisionPanel({
  division,
  definitions,
  isDemo,
}: {
  division: AdminDivisionAwards
  definitions: readonly AwardDefinition[]
  isDemo: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [confirmPublish, setConfirmPublish] = useState<null | boolean>(null)
  const [extraKey, setExtraKey] = useState('')
  const [extraRecords, setExtraRecords] = useState<AwardRecord[]>([])

  const records = sortAwards([...division.records, ...extraRecords], definitions)
  const suggestions = pendingConfirmations(records)
  const published = publishedAwards(records)
  const previewViews = buildDivisionViews(
    published,
    [{ slug: division.slug, name: division.name }],
    definitions,
  )

  const usedKeys = new Set(records.map((record) => record.key))
  const addable = definitions.filter((definition) => !usedKeys.has(definition.key))

  function run(action: () => Promise<{ ok: boolean; message: string; demo?: boolean }>) {
    startTransition(async () => {
      const result = await action()
      toast({
        title: result.ok ? 'Done' : result.demo ? 'Demo mode' : 'That did not work',
        description: result.message,
        variant: result.ok ? 'festive' : result.demo ? 'warning' : 'danger',
      })
      if (result.ok) router.refresh()
    })
  }

  function addAward(key: string) {
    const definition = awardDefinitionByKey(key, definitions)
    if (!definition) return
    setExtraRecords((current) => [
      ...current,
      {
        id: null,
        divisionSlug: division.slug,
        divisionName: division.name,
        key: definition.key,
        dbType: definition.dbType,
        recipient: {
          teamId: null,
          teamName: null,
          playerNames: [],
          playerId: null,
          playerName: null,
        },
        citation: '',
        isPublished: false,
        derived: false,
        createdAt: null,
      },
    ])
    setExtraKey('')
  }

  const plan = planPublish(records, confirmPublish ?? true)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Awards recorded"
          value={records.filter((record) => record.id != null).length}
          hint={`${suggestions.length} still to confirm`}
          icon={<MedalIcon size={20} />}
          tone="lilac"
        />
        <StatCard
          label="Published"
          value={published.length}
          hint={published.length > 0 ? 'Live on /awards' : 'Nothing revealed yet'}
          icon={<SparkleIcon size={20} />}
          tone={published.length > 0 ? 'mint' : 'gold'}
        />
        <StatCard
          label="Placings"
          value={placingsConfirmed(records, definitions) ? 'Confirmed' : 'Pending'}
          hint={division.hasChampion ? 'Derived from the bracket' : 'Championship not played yet'}
          icon={<TrophyIcon size={20} />}
          tone={placingsConfirmed(records, definitions) ? 'mint' : 'pink'}
        />
      </div>

      {suggestions.length > 0 && (
        <Card variant="candy-stripe">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className="font-[family-name:var(--font-heading)] font-extrabold"
                style={{ color: 'var(--color-plum)' }}
              >
                {suggestions.length} placing{suggestions.length === 1 ? '' : 's'} ready to confirm
              </p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Worked out from the Championship and the Battle for 3rd:{' '}
                {suggestions.map((record) => recipientLabel(record.recipient)).join(', ')}.
              </p>
            </div>
            <Button
              variant="festive"
              disabled={pending}
              onClick={() =>
                run(() =>
                  confirmPlacingsAction(
                    suggestions.map((record) => ({
                      id: null,
                      divisionSlug: record.divisionSlug,
                      awardKey: record.key,
                      dbType: record.dbType,
                      teamId: record.recipient.teamId,
                      playerId: null,
                      citation: '',
                      isPublished: false,
                    })),
                  ),
                )
              }
            >
              Confirm all placings
            </Button>
          </CardBody>
        </Card>
      )}

      {!division.hasChampion && (
        <Card variant="frosted">
          <CardBody className="text-sm text-[var(--color-ink-soft)]">
            The Championship for {division.name} has not been played yet, so there is nothing to
            derive. You can still record discretionary gongs below.
          </CardBody>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {records.map((record) => (
          <AwardRowEditor
            key={`${record.key}-${record.id ?? 'new'}`}
            record={record}
            definition={awardDefinitionByKey(record.key, definitions)}
            teams={division.teams}
            busy={pending}
            onSave={(input) => run(() => saveAwardAction(input))}
            onDelete={() =>
              run(() => deleteAwardAction(record.id as string, record.divisionSlug, record.key))
            }
          />
        ))}
      </div>

      {addable.length > 0 && (
        <Card variant="frosted">
          <CardBody className="flex flex-wrap items-end gap-2">
            <label className="min-w-52 flex-1 text-sm">
              <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">
                Add another award
              </span>
              <select
                className={inputClasses}
                value={extraKey}
                onChange={(event) => setExtraKey(event.target.value)}
              >
                <option value="">— Choose an award —</option>
                {addable.map((definition) => (
                  <option key={definition.key} value={definition.key}>
                    {definition.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="secondary" disabled={!extraKey} onClick={() => addAward(extraKey)}>
              Add
            </Button>
            <p className="w-full text-xs text-[var(--color-ink-muted)]">
              The catalogue is configurable — extra award types can be added to the{' '}
              <code>award-config</code> content blob without a code change.
            </p>
          </CardBody>
        </Card>
      )}

      <Card variant="frosted">
        <CardBody className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending}
            onClick={() => setConfirmPublish(true)}
          >
            Publish all
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setConfirmPublish(false)}>
            Hide all
          </Button>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Nothing appears on the public awards page until you publish it — no early reveals.
          </p>
        </CardBody>
      </Card>

      {published.length > 0 && (
        <section aria-label="Public preview" className="rounded-[var(--radius-lg)] bg-white/60 p-4">
          <p className="mb-3 font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
            What the public sees
          </p>
          <WinnersShowcase divisions={previewViews} definitions={definitions} />
        </section>
      )}

      <Modal
        open={confirmPublish !== null}
        onClose={() => setConfirmPublish(null)}
        title={confirmPublish ? 'Publish the winners?' : 'Hide the winners?'}
        description={
          confirmPublish
            ? 'Everyone with the link will see the podium immediately.'
            : 'The public awards page will go back to its "to be crowned" state.'
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">{plan.summary}</p>
          {plan.blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-danger)]">
              {plan.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {isDemo && (
            <p className="text-sm text-[var(--color-warn)]">
              Demo mode — this will be previewed but not saved.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={pending || plan.blockers.length > 0}
              onClick={() => {
                const publish = confirmPublish === true
                setConfirmPublish(null)
                run(() => setPublishedAction(records, division.slug, publish))
              }}
            >
              {confirmPublish ? 'Yes, publish' : 'Yes, hide'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmPublish(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export interface AwardsAdminClientProps {
  divisions: AdminDivisionAwards[]
  definitions: AwardDefinition[]
  isDemo: boolean
}

export function AwardsAdminClient({ divisions, definitions, isDemo }: AwardsAdminClientProps) {
  return (
    <ToastProvider>
      <AwardsAdminInner divisions={divisions} definitions={definitions} isDemo={isDemo} />
    </ToastProvider>
  )
}

/** The root layout has no ToastProvider, so this page brings its own. */
function AwardsAdminInner({ divisions, definitions, isDemo }: AwardsAdminClientProps) {
  const totalPublished = divisions.reduce(
    (total, division) => total + publishedAwards(division.records).length,
    0,
  )
  const anyUnconfirmed = divisions.some((division) => pendingConfirmations(division.records).length > 0)

  return (
    <div>
      <AdminPageHeader
        eyebrow="The ceremony"
        title="Awards & MVPs"
        description="Confirm the placings the bracket already worked out, add the discretionary gongs, then publish when the presentation starts."
        actions={
          <Badge status={totalPublished > 0 ? 'approved' : 'pending'}>
            {totalPublished > 0 ? `${totalPublished} published` : 'Nothing published'}
          </Badge>
        }
      />

      {anyUnconfirmed && (
        <div
          role="status"
          className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3.5 text-sm text-[var(--color-warn)]"
        >
          <TrophyIcon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-[family-name:var(--font-heading)] font-bold">
              Placings are waiting for you.
            </span>{' '}
            They come straight from the Championship and Battle for 3rd results — check the names and
            hit confirm.
          </p>
        </div>
      )}

      {divisions.length === 0 ? (
        <Card variant="frosted">
          <CardBody>No divisions are published yet, so there is nobody to give awards to.</CardBody>
        </Card>
      ) : (
        <Tabs
          items={divisions.map((division) => ({
            id: division.slug,
            label: division.name,
            content: (
              <DivisionPanel division={division} definitions={definitions} isDemo={isDemo} />
            ),
          }))}
        />
      )}
    </div>
  )
}
