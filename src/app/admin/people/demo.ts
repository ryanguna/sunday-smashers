import type { PersonRoles } from '@/lib/people'

/**
 * Demo accounts for the roles screen.
 *
 * Shaped to exercise every branch of the UI without a database: a committee
 * with two admins (so demotion is *allowed* and the button is live), the
 * signed-in admin themselves (whose admin toggle must be refused), officials
 * holding the narrower roles, and plain players with nothing but `player`.
 */
export const DEMO_PEOPLE: PersonRoles[] = [
  {
    userId: 'demo-admin-1',
    fullName: 'Grace Holly',
    nickname: 'Tinsel',
    email: 'grace@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-06-02T09:00:00.000Z',
    roles: ['player', 'admin'],
  },
  {
    userId: 'demo-admin-2',
    fullName: 'Marcus Frost',
    nickname: null,
    email: 'marcus@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-06-04T09:00:00.000Z',
    roles: ['player', 'admin', 'tabulator'],
  },
  {
    userId: 'demo-tabulator',
    fullName: 'Anita Bell',
    nickname: 'Jingle',
    email: 'anita@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-07-11T09:00:00.000Z',
    roles: ['player', 'tabulator'],
  },
  {
    userId: 'demo-official',
    fullName: 'Sam Pine',
    nickname: null,
    email: 'sam@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-07-18T09:00:00.000Z',
    roles: ['player', 'duty_official'],
  },
  {
    userId: 'demo-player-1',
    fullName: 'Priya Patel',
    nickname: 'Rocket',
    email: 'priya@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-08-01T09:00:00.000Z',
    roles: ['player'],
  },
  {
    userId: 'demo-player-2',
    fullName: 'Dave Nguyen',
    nickname: null,
    email: 'dave@smashers.example',
    avatarUrl: null,
    joinedAt: '2026-08-03T09:00:00.000Z',
    roles: ['player'],
  },
]
