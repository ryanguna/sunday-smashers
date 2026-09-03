/**
 * Hand-written database types matching `supabase/schema.sql` /
 * `supabase/migrations/0001_initial_schema.sql` exactly.
 *
 * These are authored by hand (not generated) because there is no linked
 * Supabase project yet. Once one exists and the migration has been pushed,
 * regenerate with:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 *
 * and diff against this file to catch any drift. `client.ts` / `server.ts`
 * are already generic over `Database`, so nothing else needs to change.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = 'public' | 'player' | 'duty_official' | 'tabulator' | 'admin'
export type RegistrationStatus = 'pending' | 'approved' | 'waitlisted' | 'rejected'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type DivisionGender = 'mens' | 'womens' | 'mixed' | 'open'
/** Mirrors `MatchStage` in src/lib/draw.ts exactly. */
export type MatchStageEnum = 'elims' | 'semi' | 'third_place' | 'final'
/**
 * Every match status, as a runtime list so tests can iterate them exhaustively.
 *
 * `MatchStatus` is derived from this rather than the other way round: a status
 * added to the union alone would be invisible to the exhaustiveness checks
 * that keep `DECIDED_MATCH_STATUSES` and its callers honest.
 */
export const MATCH_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  /** Did not play: no-show, ineligible. Normalised to points_to_win-0. */
  'forfeited',
  /** Opponent withdrew before play started. Normalised to points_to_win-0. */
  'walkover',
  'cancelled',
  /** Started and stopped mid-game (injury). Keeps the score actually played. */
  'retired',
] as const

export type MatchStatus = (typeof MATCH_STATUSES)[number]

/**
 * Every `MatchStatus` that represents a played-out result, as opposed to a
 * match still to come, in play, or called off.
 *
 * Exported as a constant because four call sites independently hand-wrote this
 * list and every one of them disagreed — variously omitting `walkover` and
 * `retired` — which under-counted played matches on the admin dashboard.
 * Add a status to the union above and the type error here is the reminder.
 */
export const DECIDED_MATCH_STATUSES = [
  'completed',
  'forfeited',
  'walkover',
  'retired',
] as const satisfies readonly MatchStatus[]

export type DecidedMatchStatus = (typeof DECIDED_MATCH_STATUSES)[number]

export type DutyRole = 'umpire_scorer' | 'scoresheet' | 'line_judge'
export type ScoresheetStatus = 'draft' | 'awaiting_signature' | 'submitted' | 'verified' | 'disputed'
export type AwardType =
  | 'champion'
  | 'runner_up'
  | 'third_place'
  | 'fourth_place'
  | 'sportsmanship'
  | 'special_mention'
export type PartnerInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
export type TournamentStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'archived'
export type ChecklistItemType = 'loot_bag' | 'shirt' | 'medal' | 'trophy' | 'prize_money'
export type PhotoModerationStatus = 'pending' | 'approved' | 'rejected'

// ---------------------------------------------------------------------------
// Table row helpers
// ---------------------------------------------------------------------------

interface TableDef<Row, Insert, Update> {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type ProfileRow = {
  id: string
  full_name: string
  nickname: string | null
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
  phone: string | null
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'open' | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
  updated_at: string
  /**
   * Read-only mirror of `auth.users.email`, maintained by trigger.
   *
   * Never write this — it is reverted by `guard_profile_email`. Change the
   * auth user instead and the mirror follows. Visible only to the owner and
   * to admins (`profiles_select_own`); deliberately absent from
   * `player_directory`.
   */
  email: string | null
}

export type UserRoleRow = {
  user_id: string
  role: UserRole
  granted_by: string | null
  created_at: string
}

export type TournamentRow = {
  id: string
  name: string
  slug: string
  tournament_date: string
  registration_opens_at: string
  registration_closes_at: string | null
  venue_name: string | null
  venue_address: string | null
  status: TournamentStatus
  is_published: boolean
  is_registration_open: boolean
  description: string | null
  /** Entry fee per player, in cents (migration 0010). Single source of truth. */
  entry_fee_cents: number | null
  /** How to actually pay: bank/PayID details, reference format, deadline. */
  payment_instructions: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  /** When players should arrive — distinct from the first serve. */
  doors_open_at: string | null
  created_at: string
  updated_at: string
}

/**
 * The published-only projection of `tournaments` that anon may read
 * (migration 0010). Drives the public countdown, the registration gate and
 * the "the details" block. Omits nothing sensitive — the contact columns are
 * the *organisers'*, published on purpose.
 */
export type TournamentPublicRow = Omit<
  TournamentRow,
  'created_at' | 'updated_at' | 'is_published'
>

export type DivisionRow = {
  id: string
  tournament_id: string
  name: string
  gender: DivisionGender
  format_kind: 'round_robin_knockout' | 'single_round_robin' | 'knockout_only'
  points_to_win_elims: number
  deuce_enabled_elims: boolean
  cap_elims: number | null
  points_to_win_finals: number
  deuce_enabled_finals: boolean
  cap_finals: number | null
  qualifying_places: number
  tiebreak_order: string[]
  max_teams: number | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export type RegistrationRow = {
  id: string
  tournament_id: string
  division_id: string
  player_id: string
  status: RegistrationStatus
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type TeamRow = {
  id: string
  division_id: string
  name: string | null
  seed: number | null
  is_confirmed: boolean
  created_at: string
  updated_at: string
}

export type TeamMemberRow = {
  team_id: string
  player_id: string
  registration_id: string | null
  created_at: string
}

export type PartnerInviteRow = {
  /** Denormalised at insert (migration 0010) — profiles is owner-only, so the invitee cannot read it otherwise. */
  inviter_name: string | null
  id: string
  division_id: string
  inviter_id: string
  invitee_id: string | null
  invitee_email: string | null
  status: PartnerInviteStatus
  resulting_team_id: string | null
  created_at: string
  updated_at: string
  responded_at: string | null
}

export type PaymentRow = {
  id: string
  registration_id: string
  amount_cents: number
  amount_paid_cents: number
  status: PaymentStatus
  method: 'cash' | 'bank_transfer' | 'card' | 'other' | null
  reference: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export type CourtRow = {
  id: string
  tournament_id: string
  name: string
  sort_order: number
  created_at: string
}

export type TimeSlotRow = {
  id: string
  tournament_id: string
  starts_at: string
  ends_at: string
  label: string | null
  created_at: string
}

export type MatchRow = {
  id: string
  division_id: string
  stage: MatchStageEnum
  round: number | null
  bracket_key: 'M1' | 'M2' | 'THIRD' | 'FINAL' | null
  court_id: string | null
  time_slot_id: string | null
  team_a_id: string | null
  team_b_id: string | null
  points_to_win: number
  deuce_enabled: boolean
  cap: number | null
  status: MatchStatus
  score_a: number
  score_b: number
  winner_team_id: string | null
  forfeited_by_team_id: string | null
  forfeit_reason: string | null
  next_match_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ScoreEventRow = {
  id: string
  match_id: string
  sequence: number
  side: 'a' | 'b'
  /**
   * Mirrors the `check` on `score_events.event_type`. `'walkover'` and
   * `'retire'` arrived with migration 0006 so that an injured pair is not
   * recorded — or displayed — as having forfeited.
   */
  event_type: 'point' | 'undo' | 'forfeit' | 'walkover' | 'retire' | 'game_start' | 'game_end'
  score_a_after: number
  score_b_after: number
  scored_by: string | null
  note: string | null
  created_at: string
}

export type ScoresheetRow = {
  id: string
  match_id: string
  court_id: string | null
  status: ScoresheetStatus
  score_a: number
  score_b: number
  photo_url: string | null
  submitted_by: string | null
  submitted_at: string | null
  verified_by: string | null
  verified_at: string | null
  dispute_reason: string | null
  created_at: string
  updated_at: string
}

export type ScoresheetSignatureRow = {
  id: string
  scoresheet_id: string
  player_id: string
  game_number: number
  signed_at: string
}

export type DutyAssignmentRow = {
  id: string
  match_id: string
  player_id: string
  duty_role: DutyRole
  source_match_id: string | null
  created_at: string
}

export type AnnouncementRow = {
  id: string
  tournament_id: string
  title: string
  body: string
  is_published: boolean
  is_pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AwardRow = {
  id: string
  division_id: string
  team_id: string | null
  player_id: string | null
  award_type: AwardType
  /** Stable key for configurable awards (migration 0005). Mirrors `award_type` for placings. */
  award_key: string
  citation: string | null
  is_published: boolean
  created_at: string
}

/** Committee readiness board (migration 0005). Distinct from `checklist_items`. */
export type CommitteeChecklistRow = {
  id: string
  tournament_id: string
  category: string
  label: string
  owner: string | null
  notes: string | null
  due_on: string | null
  is_done: boolean
  done_at: string | null
  done_by: string | null
  position: number
  created_at: string
  updated_at: string
}

export type PhotoRow = {
  id: string
  tournament_id: string
  match_id: string | null
  storage_path: string
  caption: string | null
  uploaded_by: string | null
  is_approved: boolean
  approved_by: string | null
  created_at: string
  moderation_status: PhotoModerationStatus
  is_featured: boolean
  moderated_at: string | null
  rejection_reason: string | null
}

/** Signed-in-only, column-whitelisted view of profiles for partner lookup (migration 0002). */
export type PlayerDirectoryRow = {
  id: string
  full_name: string
  nickname: string | null
  avatar_url: string | null
}

export type ChecklistItemRow = {
  id: string
  tournament_id: string
  player_id: string
  item_type: ChecklistItemType
  is_collected: boolean
  collected_at: string | null
  recorded_by: string | null
  notes: string | null
}

export type AuditLogRow = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Json
  created_at: string
}

export type SiteContentRow = {
  slug: string
  title: string
  body_markdown: string
  is_published: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Migration 0011. `page_key` is a `SitePageKey` from src/lib/site-pages.ts,
 * typed as plain `string` here because the catalogue is application code —
 * the database deliberately accepts any key and simply ignores unknown ones.
 */
export type SitePageVisibilityRow = {
  page_key: string
  is_visible: boolean
  updated_at: string
  updated_by: string | null
}

/** Raw aggregates only — see the SQL view comment in schema.sql. */
export type StandingsViewRow = {
  team_id: string
  division_id: string
  played: number
  wins: number
  losses: number
  forfeits: number
  points_for: number
  points_against: number
  point_diff: number
}

type Insertable<Row, RequiredKeys extends keyof Row> = Partial<Row> & Pick<Row, RequiredKeys>

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      // `email` is excluded from the Update type on purpose: it is a
      // trigger-maintained mirror of auth.users, and the database silently
      // reverts direct writes. Better a compile error than a write that
      // appears to succeed and is then discarded.
      profiles: TableDef<
        ProfileRow,
        Insertable<ProfileRow, 'id' | 'full_name'>,
        Partial<Omit<ProfileRow, 'email'>>
      >
      user_roles: TableDef<UserRoleRow, Insertable<UserRoleRow, 'user_id' | 'role'>, Partial<UserRoleRow>>
      tournaments: TableDef<
        TournamentRow,
        Insertable<TournamentRow, 'name' | 'slug' | 'tournament_date' | 'registration_opens_at'>,
        Partial<TournamentRow>
      >
      divisions: TableDef<
        DivisionRow,
        Insertable<DivisionRow, 'tournament_id' | 'name' | 'gender'>,
        Partial<DivisionRow>
      >
      registrations: TableDef<
        RegistrationRow,
        Insertable<RegistrationRow, 'tournament_id' | 'division_id' | 'player_id'>,
        Partial<RegistrationRow>
      >
      teams: TableDef<TeamRow, Insertable<TeamRow, 'division_id'>, Partial<TeamRow>>
      team_members: TableDef<
        TeamMemberRow,
        Insertable<TeamMemberRow, 'team_id' | 'player_id'>,
        Partial<TeamMemberRow>
      >
      partner_invites: TableDef<
        PartnerInviteRow,
        Insertable<PartnerInviteRow, 'division_id' | 'inviter_id'>,
        Partial<PartnerInviteRow>
      >
      payments: TableDef<
        PaymentRow,
        Insertable<PaymentRow, 'registration_id' | 'amount_cents'>,
        Partial<PaymentRow>
      >
      courts: TableDef<CourtRow, Insertable<CourtRow, 'tournament_id' | 'name'>, Partial<CourtRow>>
      time_slots: TableDef<
        TimeSlotRow,
        Insertable<TimeSlotRow, 'tournament_id' | 'starts_at' | 'ends_at'>,
        Partial<TimeSlotRow>
      >
      matches: TableDef<MatchRow, Insertable<MatchRow, 'division_id' | 'stage'>, Partial<MatchRow>>
      score_events: TableDef<
        ScoreEventRow,
        Insertable<ScoreEventRow, 'match_id' | 'sequence' | 'side' | 'score_a_after' | 'score_b_after'>,
        Partial<ScoreEventRow>
      >
      scoresheets: TableDef<ScoresheetRow, Insertable<ScoresheetRow, 'match_id'>, Partial<ScoresheetRow>>
      scoresheet_signatures: TableDef<
        ScoresheetSignatureRow,
        Insertable<ScoresheetSignatureRow, 'scoresheet_id' | 'player_id'>,
        Partial<ScoresheetSignatureRow>
      >
      duty_assignments: TableDef<
        DutyAssignmentRow,
        Insertable<DutyAssignmentRow, 'match_id' | 'player_id' | 'duty_role'>,
        Partial<DutyAssignmentRow>
      >
      announcements: TableDef<
        AnnouncementRow,
        Insertable<AnnouncementRow, 'tournament_id' | 'title' | 'body'>,
        Partial<AnnouncementRow>
      >
      awards: TableDef<AwardRow, Insertable<AwardRow, 'division_id' | 'award_type'>, Partial<AwardRow>>
      committee_checklist: TableDef<
        CommitteeChecklistRow,
        Insertable<CommitteeChecklistRow, 'tournament_id' | 'category' | 'label'>,
        Partial<CommitteeChecklistRow>
      >
      photos: TableDef<PhotoRow, Insertable<PhotoRow, 'tournament_id' | 'storage_path'>, Partial<PhotoRow>>
      checklist_items: TableDef<
        ChecklistItemRow,
        Insertable<ChecklistItemRow, 'tournament_id' | 'player_id' | 'item_type'>,
        Partial<ChecklistItemRow>
      >
      audit_log: TableDef<
        AuditLogRow,
        Insertable<AuditLogRow, 'action' | 'entity_type'>,
        Partial<AuditLogRow>
      >
      site_content: TableDef<
        SiteContentRow,
        Insertable<SiteContentRow, 'slug' | 'title' | 'body_markdown'>,
        Partial<SiteContentRow>
      >
      site_page_visibility: TableDef<
        SitePageVisibilityRow,
        Insertable<SitePageVisibilityRow, 'page_key'>,
        Partial<SitePageVisibilityRow>
      >
    }
    Views: {
      standings: {
        Row: StandingsViewRow
        Relationships: []
      }
      /**
       * Name and avatar only — safe for anonymous visitors. `profiles` itself
       * is readable only by the owner and organisers because it also holds
       * phone numbers and emergency contacts, which is why the public pages
       * must read names from here. Migration 0009 removed the
       * `auth.uid() is not null` predicate that made this view return nothing
       * to the very audience it exists for.
       */
      player_directory: {
        Row: PlayerDirectoryRow
        Relationships: []
      }
      /**
       * Published-only tournament settings (migration 0010). The public site
       * derives its countdown, registration gate, entry fee and "the details"
       * block from this instead of from hardcoded constants in source.
       */
      tournament_public: {
        Row: TournamentPublicRow
        Relationships: []
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      /**
       * First-run bootstrap (migration 0010). Promotes the caller to admin,
       * but ONLY while the system has no admin at all; inert thereafter.
       * Exists because every signup gets 'player' and the only role-granting
       * UI is itself behind the admin guard.
       */
      claim_first_admin: {
        Args: Record<string, never>
        Returns: string
      }
      /** True once at least one admin exists — decides whether /setup offers the claim. */
      admin_exists: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_tabulator: {
        Args: Record<string, never>
        Returns: boolean
      }
      has_role: {
        Args: { _user_id: string; _role: UserRole }
        Returns: boolean
      }
      is_match_duty_official: {
        Args: { _match_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string }
        Returns: boolean
      }
      /** Atomic delete-then-insert of a stage's fixtures (migration 0004). Returns rows inserted. */
      publish_draw: {
        Args: {
          p_division_id: string
          p_stage: MatchStageEnum
          p_matches: Json
          p_force?: boolean
        }
        Returns: number
      }
      /**
       * Accepts a partner invite and creates the pair atomically (migration
       * 0009). Previously the client did this as three unchecked writes; RLS
       * refused the `teams` insert and PostgREST reports a refused write as
       * "0 rows, no error", so the UI announced a partnership that did not
       * exist. Returns the team id. Idempotent: re-accepting returns the same
       * team rather than creating a second one.
       */
      accept_partner_invite: {
        Args: {
          p_invite_id: string
          p_team_name: string
        }
        Returns: string
      }
    }
    Enums: {
      user_role: UserRole
      registration_status: RegistrationStatus
      payment_status: PaymentStatus
      division_gender: DivisionGender
      match_stage: MatchStageEnum
      match_status: MatchStatus
      duty_role: DutyRole
      scoresheet_status: ScoresheetStatus
      award_type: AwardType
      partner_invite_status: PartnerInviteStatus
      tournament_status: TournamentStatus
      checklist_item_type: ChecklistItemType
      photo_moderation_status: PhotoModerationStatus
    }
    CompositeTypes: Record<string, never>
  }
}
