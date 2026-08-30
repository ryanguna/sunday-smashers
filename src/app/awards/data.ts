import { cache } from 'react'

import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import type { AwardRow, ProfileRow } from '@/lib/supabase/types'
import { getBrackets, getStandings, type PublicTeam } from '@/lib/public-data'
import {
  DEFAULT_AWARD_DEFINITIONS,
  buildDivisionViews,
  citationFromRow,
  publishedAwards,
  type AwardRecord,
  type AwardsDivisionView,
} from '@/lib/awards'

/**
 * Data for the public `/awards` page.
 *
 * Uses the *browser* Supabase client (no cookies, anon key only) exactly
 * like `@/lib/public-data`, so this module stays importable from a static
 * page and never drags `next/headers` in.
 *
 * RLS does the gating: `awards_select_published_or_admin` means the anon key
 * can only ever see `is_published` rows. `publishedAwards()` re-filters
 * anyway — belt and braces, because an early podium reveal is the one bug
 * this feature really must not have.
 */

export interface PublicAwardsData {
  views: AwardsDivisionView[]
  publishedCount: number
  /** True when the winners shown are the bundled demo dataset. */
  isDemo: boolean
}

function teamRecipient(team: PublicTeam | null, fallbackId: string | null) {
  return {
    teamId: team?.id ?? fallbackId,
    teamName: team?.name ?? fallbackId,
    playerNames: team?.players.map((player) => player.name) ?? [],
    playerId: null,
    playerName: null,
  }
}

/**
 * Demo winners: the podium comes straight from the demo bracket's
 * `placings` (so it agrees with `/bracket`), plus a couple of hand-written
 * discretionary gongs so the page shows what a full ceremony looks like.
 */
async function demoAwards(): Promise<PublicAwardsData> {
  const [brackets, standings] = await Promise.all([getBrackets(), getStandings()])
  const divisions = standings.map((entry) => ({
    slug: entry.division.slug,
    name: entry.division.name,
  }))

  const records: AwardRecord[] = []

  for (const bracket of brackets) {
    const slug = bracket.division.slug
    const name = bracket.division.name
    const placings: [string, PublicTeam | null][] = [
      ['champion', bracket.placings.champion],
      ['runner_up', bracket.placings.runnerUp],
      ['third_place', bracket.placings.third],
      ['fourth_place', bracket.placings.fourth],
    ]

    for (const [key, team] of placings) {
      if (!team) continue
      records.push({
        id: `demo-${slug}-${key}`,
        divisionSlug: slug,
        divisionName: name,
        key,
        dbType: key as AwardRow['award_type'],
        recipient: teamRecipient(team, null),
        citation: '',
        isPublished: true,
        derived: true,
        createdAt: null,
      })
    }

    const champion = bracket.placings.champion
    if (champion) {
      const [first, second] = champion.players
      if (first) {
        records.push({
          id: `demo-${slug}-mvp`,
          divisionSlug: slug,
          divisionName: name,
          key: 'mvp',
          dbType: 'special_mention',
          recipient: {
            teamId: champion.id,
            teamName: champion.name,
            playerNames: [],
            playerId: first.id,
            playerName: first.name,
          },
          citation: 'Unbeaten in the round robin and ice-cold in the final.',
          isPublished: true,
          derived: false,
          createdAt: null,
        })
      }
      if (second) {
        records.push({
          id: `demo-${slug}-outfit`,
          divisionSlug: slug,
          divisionName: name,
          key: 'best_outfit',
          dbType: 'special_mention',
          recipient: {
            teamId: champion.id,
            teamName: champion.name,
            playerNames: [],
            playerId: second.id,
            playerName: second.name,
          },
          citation: 'Antlers, tinsel racket grip and a light-up jumper.',
          isPublished: true,
          derived: false,
          createdAt: null,
        })
      }
    }

    const runnerUp = bracket.placings.runnerUp
    if (runnerUp) {
      records.push({
        id: `demo-${slug}-sportsmanship`,
        divisionSlug: slug,
        divisionName: name,
        key: 'sportsmanship',
        dbType: 'sportsmanship',
        recipient: teamRecipient(runnerUp, null),
        citation: 'Called their own faults all day and clapped the winners loudest.',
        isPublished: true,
        derived: false,
        createdAt: null,
      })
    }
  }

  const visible = publishedAwards(records)
  return {
    views: buildDivisionViews(visible, divisions, DEFAULT_AWARD_DEFINITIONS),
    publishedCount: visible.length,
    isDemo: true,
  }
}

export const getPublicAwards = cache(async function getPublicAwards(): Promise<PublicAwardsData> {
  if (!isSupabaseConfigured()) return demoAwards()

  try {
    const standings = await getStandings()
    const divisions = standings.map((entry) => ({
      slug: entry.division.slug,
      name: entry.division.name,
    }))
    if (divisions.length === 0) return demoAwards()

    const teamsById = new Map<string, PublicTeam>()
    for (const entry of standings) {
      for (const row of entry.rows) teamsById.set(row.team.id, row.team)
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('awards')
      .select('*')
      .eq('is_published', true)
      .in(
        'division_id',
        divisions.map((division) => division.slug),
      )
    if (error) return demoAwards()

    const rows = (data as AwardRow[] | null) ?? []
    if (rows.length === 0) {
      return { views: buildDivisionViews([], divisions), publishedCount: 0, isDemo: false }
    }

    const playerIds = [...new Set(rows.map((row) => row.player_id).filter((id): id is string => !!id))]
    const { data: profileRows } =
      playerIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, nickname').in('id', playerIds)
        : { data: [] as Pick<ProfileRow, 'id' | 'full_name' | 'nickname'>[] }

    const nameById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile.nickname || profile.full_name]),
    )
    const divisionNameById = new Map(divisions.map((division) => [division.slug, division.name]))

    const records: AwardRecord[] = rows.map((row) => {
      const team = row.team_id ? (teamsById.get(row.team_id) ?? null) : null
      return {
        id: row.id,
        divisionSlug: row.division_id,
        divisionName: divisionNameById.get(row.division_id) ?? 'Division',
        key: row.award_key,
        dbType: row.award_type,
        recipient: {
          ...teamRecipient(team, row.team_id),
          playerId: row.player_id,
          playerName: row.player_id ? (nameById.get(row.player_id) ?? 'Player') : null,
        },
        citation: citationFromRow(row.citation),
        isPublished: row.is_published,
        derived: false,
        createdAt: row.created_at,
      }
    })

    const visible = publishedAwards(records)
    return {
      views: buildDivisionViews(visible, divisions),
      publishedCount: visible.length,
      isDemo: false,
    }
  } catch {
    // A public celebration page must never 500 on a database hiccup.
    return demoAwards()
  }
})
