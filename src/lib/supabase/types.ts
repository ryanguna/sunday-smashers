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
export type MatchStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  /** Did not play: no-show, ineligible. Normalised to points_to_win-0. */
  | 'forfeited'
  /** Opponent withdrew before play started. Normalised to points_to_win-0. */
  | 'walkover'
  | 'cancelled'
  /** Started and stopped mid-game (injury). Keeps the score actually played. */
  | 'retired'
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
  shirt_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL' | null
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'open' | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
}

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
  event_type: 'point' | 'undo' | 'forfeit' | 'game_start' | 'game_end'
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
      profiles: TableDef<ProfileRow, Insertable<ProfileRow, 'id' | 'full_name'>, Partial<ProfileRow>>
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
    }
    Views: {
      standings: {
        Row: StandingsViewRow
        Relationships: []
      }
      player_directory: {
        Row: PlayerDirectoryRow
        Relationships: []
      }
    }
    Functions: {
      is_admin: {
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
