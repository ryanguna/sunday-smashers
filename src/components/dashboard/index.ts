/**
 * Player dashboard surfaces (`/dashboard`).
 *
 * Every component here takes plain data as props — all fetching happens in
 * `src/app/dashboard/data.ts` (server) or, for partner invites and profile
 * edits, through the browser Supabase client inside the two Client
 * Components. Nothing in this folder imports `@/lib/supabase/server`, which
 * would break the client bundle.
 */
export * from './Celebration'
export * from './DashboardStates'
export * from './FixturesList'
export * from './InvitesCard'
export * from './MatchCountdown'
export * from './NextDutyCard'
export * from './NextMatchHero'
export * from './ProfileCard'
export * from './QuickLinks'
export * from './StandingCard'
export * from './StatusCard'
export * from './TeamCard'
