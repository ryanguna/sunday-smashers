import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { AwardRow, ProfileRow, SiteContentRow } from '@/lib/supabase/types'
import { getBrackets, getStandings, type PublicTeam } from '@/lib/public-data'
import {
  DEFAULT_AWARD_DEFINITIONS,
  decodeCitation,
  derivePlacingAwards,
  mergeAwardDefinitions,
  mergeSuggestions,
  type AwardDefinition,
  type AwardRecord,
} from '@/lib/awards'

/**
 * Server-only data for `/admin/awards`.
 *
 * Placings are never typed in: `getBrackets()` already runs `finalPlacings`
 * over the real (or demo) match results, and `derivePlacingAwards` turns
 * that into rows the admin only has to confirm.
 *
 * The award *catalogue* is configurable. Extra/overridden definitions live
 * as JSON in `site_content` under `AWARD_CONFIG_SLUG`, the same escape hatch
 * the settings console uses for config with no column yet.
 */

/** `site_content.slug` holding the configurable award catalogue. */
export const AWARD_CONFIG_SLUG = 'award-config'

export interface AdminDivisionAwards {
  slug: string
  name: string
  /** Saved rows merged with derived-but-unconfirmed suggestions. */
  records: AwardRecord[]
  /** Every confirmed pair in the division, for the recipient pickers. */
  teams: PublicTeam[]
  /** True when `finalPlacings` produced a champion for this division. */
  hasChampion: boolean
}

export interface AdminAwardsData {
  divisions: AdminDivisionAwards[]
  definitions: AwardDefinition[]
  isDemo: boolean
}

function teamRecipientOf(team: PublicTeam | null, fallbackId: string | null) {
  return {
    teamId: team?.id ?? fallbackId,
    teamName: team?.name ?? fallbackId,
    playerNames: team?.players.map((player) => player.name) ?? [],
    playerId: null,
    playerName: null,
  }
}

async function buildSuggestions(): Promise<{
  divisions: AdminDivisionAwards[]
  teamsById: Map<string, PublicTeam>
}> {
  const [brackets, standings] = await Promise.all([getBrackets(), getStandings()])

  const teamsById = new Map<string, PublicTeam>()
  const teamsByDivision = new Map<string, PublicTeam[]>()
  for (const entry of standings) {
    const teams = entry.rows.map((row) => row.team)
    teamsByDivision.set(entry.division.slug, teams)
    for (const team of teams) teamsById.set(team.id, team)
  }

  const divisions: AdminDivisionAwards[] = standings.map((entry) => {
    const bracket = brackets.find((b) => b.division.slug === entry.division.slug) ?? null
    const teams = teamsByDivision.get(entry.division.slug) ?? []
    const placings = bracket?.placings ?? {
      champion: null,
      runnerUp: null,
      third: null,
      fourth: null,
    }

    const suggestions = derivePlacingAwards({
      divisionSlug: entry.division.slug,
      divisionName: entry.division.name,
      placings: {
        champion: placings.champion?.id ?? null,
        runnerUp: placings.runnerUp?.id ?? null,
        third: placings.third?.id ?? null,
        fourth: placings.fourth?.id ?? null,
      },
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        playerNames: team.players.map((player) => player.name),
      })),
    })

    return {
      slug: entry.division.slug,
      name: entry.division.name,
      records: suggestions,
      teams,
      hasChampion: placings.champion != null,
    }
  })

  return { divisions, teamsById }
}

function parseDefinitions(raw: string | null | undefined): AwardDefinition[] {
  if (!raw) return [...DEFAULT_AWARD_DEFINITIONS]
  try {
    const parsed: unknown = JSON.parse(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { awards?: unknown }).awards)
        ? ((parsed as { awards: unknown[] }).awards)
        : []
    return mergeAwardDefinitions(list as Partial<AwardDefinition>[])
  } catch {
    return [...DEFAULT_AWARD_DEFINITIONS]
  }
}

export const getAdminAwardsData = cache(async function getAdminAwardsData(): Promise<AdminAwardsData> {
  const { divisions, teamsById } = await buildSuggestions()

  if (!isSupabaseConfigured()) {
    return { divisions, definitions: [...DEFAULT_AWARD_DEFINITIONS], isDemo: true }
  }

  try {
    const supabase = await createClient()
    const [awardsRes, configRes] = await Promise.all([
      supabase
        .from('awards')
        .select('*')
        .in(
          'division_id',
          divisions.map((division) => division.slug),
        ),
      supabase.from('site_content').select('*').eq('slug', AWARD_CONFIG_SLUG).maybeSingle(),
    ])

    const definitions = parseDefinitions((configRes.data as SiteContentRow | null)?.body_markdown)
    const rows = (awardsRes.data as AwardRow[] | null) ?? []

    const playerIds = [...new Set(rows.map((row) => row.player_id).filter((id): id is string => !!id))]
    const { data: profileRows } =
      playerIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, nickname').in('id', playerIds)
        : { data: [] as Pick<ProfileRow, 'id' | 'full_name' | 'nickname'>[] }
    const nameById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile.nickname || profile.full_name]),
    )

    const savedByDivision = new Map<string, AwardRecord[]>()
    for (const row of rows) {
      const division = divisions.find((entry) => entry.slug === row.division_id)
      const { key, text } = decodeCitation(row.citation, row.award_type)
      const team = row.team_id ? (teamsById.get(row.team_id) ?? null) : null
      const record: AwardRecord = {
        id: row.id,
        divisionSlug: row.division_id,
        divisionName: division?.name ?? 'Division',
        key: key ?? row.award_type,
        dbType: row.award_type,
        recipient: {
          ...teamRecipientOf(team, row.team_id),
          playerId: row.player_id,
          playerName: row.player_id ? (nameById.get(row.player_id) ?? 'Player') : null,
        },
        citation: text,
        isPublished: row.is_published,
        derived: false,
        createdAt: row.created_at,
      }
      const list = savedByDivision.get(row.division_id) ?? []
      list.push(record)
      savedByDivision.set(row.division_id, list)
    }

    return {
      divisions: divisions.map((division) => ({
        ...division,
        records: mergeSuggestions(
          savedByDivision.get(division.slug) ?? [],
          division.records,
          definitions,
        ),
      })),
      definitions,
      isDemo: false,
    }
  } catch {
    // Never leave an admin staring at a blank console mid-ceremony.
    return { divisions, definitions: [...DEFAULT_AWARD_DEFINITIONS], isDemo: true }
  }
})
