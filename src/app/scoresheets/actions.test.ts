import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Server Actions behind the digital scoresheet, run against a fake
 * PostgREST.
 *
 * Two failures are pinned here because both shipped and neither raised an
 * error:
 *
 *  1. The write path used to decide which pair a signature belonged to by its
 *     position in an unordered query. Whenever the second pair signed first,
 *     the first pair was told "that pair has already signed" and the sheet
 *     could never be submitted.
 *  2. Under RLS, PostgREST reports a write no policy allows as *zero rows
 *     affected, with no error*. "Take this signature back" therefore reported
 *     success while the row stayed exactly where it was. The fake below
 *     models that precisely — `deny` refuses rows the way a policy does, not
 *     by returning an error.
 */

// ---------------------------------------------------------------------------
// A very small PostgREST stand-in
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
type Filter = { column: string; values: unknown[] }

interface Result {
  data: Row[] | Row | null
  error: { message: string } | null
}

class FakeDb {
  tables: Record<string, Row[]> = {
    scoresheets: [],
    scoresheet_signatures: [],
    matches: [],
    team_members: [],
    audit_log: [],
  }

  /** Row-level security: a row this returns true for is invisible to writes. */
  deny: Partial<Record<string, (row: Row, op: 'update' | 'delete') => boolean>> = {}

  private seq = 0

  nextId(prefix: string): string {
    this.seq += 1
    return `${prefix}-${this.seq}`
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | null = null
  private filters: Filter[] = []
  private returning = false
  private shape: 'many' | 'single' | 'maybe' = 'many'

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(): this {
    this.returning = true
    return this
  }

  insert(payload: Row): this {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row): this {
    this.op = 'update'
    this.payload = payload
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, values: [value] })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, values: [...values] })
    return this
  }

  order(): this {
    return this
  }

  maybeSingle(): this {
    this.shape = 'maybe'
    return this
  }

  single(): this {
    this.shape = 'single'
    return this
  }

  private matched(): Row[] {
    return this.db
      .rows(this.table)
      .filter((row) => this.filters.every((f) => f.values.includes(row[f.column])))
  }

  private allowed(rows: Row[], op: 'update' | 'delete'): Row[] {
    const deny = this.db.deny[this.table]
    return deny ? rows.filter((row) => !deny(row, op)) : rows
  }

  private run(): Result {
    if (this.op === 'insert') {
      const row = { id: this.db.nextId(this.table), ...(this.payload ?? {}) }
      this.db.rows(this.table).push(row)
      return this.wrap([row])
    }

    if (this.op === 'update') {
      const targets = this.allowed(this.matched(), 'update')
      for (const row of targets) Object.assign(row, this.payload ?? {})
      return this.wrap(targets)
    }

    if (this.op === 'delete') {
      const targets = this.allowed(this.matched(), 'delete')
      this.db.tables[this.table] = this.db.rows(this.table).filter((row) => !targets.includes(row))
      return this.wrap(targets)
    }

    return this.wrap(this.matched())
  }

  private wrap(rows: Row[]): Result {
    if (this.shape === 'many') return { data: this.returning || this.op === 'select' ? rows : null, error: null }
    if (rows.length === 0) {
      return this.shape === 'maybe'
        ? { data: null, error: null }
        : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
    }
    return { data: rows[0], error: null }
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const db = new FakeDb()
let currentUser: { id: string; email: string } | null = { id: 'a1', email: 'a1@example.com' }

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db }))
vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => currentUser,
  getProfile: async () => (currentUser ? { full_name: currentUser.id, nickname: null } : null),
}))

const { openSheet, signSheet, submitSheet, withdrawSignature } = await import('./actions')

const MATCH = 'match-1'

function seedMatch(status = 'completed'): void {
  db.tables = {
    scoresheets: [],
    scoresheet_signatures: [],
    matches: [{ id: MATCH, status, team_a_id: 'team-a', team_b_id: 'team-b' }],
    team_members: [
      { team_id: 'team-a', player_id: 'a1' },
      { team_id: 'team-a', player_id: 'a2' },
      { team_id: 'team-b', player_id: 'b1' },
      { team_id: 'team-b', player_id: 'b2' },
    ],
    audit_log: [],
  }
  db.deny = {}
}

function signatures(): Row[] {
  return db.rows('scoresheet_signatures')
}

async function openForSignature(): Promise<void> {
  const opened = await openSheet(MATCH)
  expect(opened.ok).toBe(true)
}

beforeEach(() => {
  currentUser = { id: 'a1', email: 'a1@example.com' }
  seedMatch()
})

// ---------------------------------------------------------------------------

describe('signSheet — the side is resolved from team membership', () => {
  it('lets pair A sign after pair B, and attributes both correctly', async () => {
    await openForSignature()

    currentUser = { id: 'b1', email: 'b1@example.com' }
    const first = await signSheet({ matchId: MATCH, side: 'b', playerId: 'b1', playerName: 'Bee One' })
    expect(first).toMatchObject({ ok: true })

    // The regression: with the side taken from list position, this stored
    // signature looked like side 'a', so pair A was refused as a duplicate.
    currentUser = { id: 'a1', email: 'a1@example.com' }
    const second = await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    expect(second).toMatchObject({ ok: true, status: 'awaiting_signature' })

    expect(signatures().map((row) => row.player_id).sort()).toEqual(['a1', 'b1'])
  })

  it('reaches the tabulator when pair B signed first', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'b', playerId: 'b2', playerName: 'Bee Two' })
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a2', playerName: 'Ay Two' })

    const submitted = await submitSheet(MATCH)
    expect(submitted).toMatchObject({ ok: true, status: 'submitted' })
  })

  it('still refuses a second signature from the same pair', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'b', playerId: 'b1', playerName: 'Bee One' })

    const again = await signSheet({ matchId: MATCH, side: 'b', playerId: 'b2', playerName: 'Bee Two' })
    expect(again.ok).toBe(false)
    expect(again.message).toContain('already signed')
    expect(signatures()).toHaveLength(1)
  })

  it('surfaces a refused signature insert instead of reporting success', async () => {
    await openForSignature()
    // A policy that lets nothing through looks like an insert returning no row.
    const insertOnly = db.from.bind(db)
    vi.spyOn(db, 'from').mockImplementation((table: string) => {
      const query = insertOnly(table)
      if (table !== 'scoresheet_signatures') return query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(query as any).then = (resolve: (value: Result) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return query
    })

    const result = await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    vi.mocked(db.from).mockRestore()

    expect(result.ok).toBe(false)
    expect(result.message).toContain('refused that signature')
  })
})

describe('withdrawSignature — a withdrawn signature actually disappears', () => {
  it('removes the row from the database', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    currentUser = { id: 'b1', email: 'b1@example.com' }
    await signSheet({ matchId: MATCH, side: 'b', playerId: 'b1', playerName: 'Bee One' })
    expect(signatures()).toHaveLength(2)

    const result = await withdrawSignature(MATCH, 'b')
    expect(result).toMatchObject({ ok: true })
    expect(signatures().map((row) => row.player_id)).toEqual(['a1'])
  })

  it('removes only the side asked for', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'b', playerId: 'b2', playerName: 'Bee Two' })
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })

    await withdrawSignature(MATCH, 'a')
    expect(signatures().map((row) => row.player_id)).toEqual(['b2'])
  })

  it('reports a delete that affected no rows as a failure, not a success', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })

    // Exactly what RLS does: the row is simply not there to delete, and
    // PostgREST says so with an empty result and no error.
    db.deny = { scoresheet_signatures: (_row, op) => op === 'delete' }

    const result = await withdrawSignature(MATCH, 'a')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('refused to remove that signature')
    expect(signatures()).toHaveLength(1)
  })

  it('reports a scoresheet update the database refused', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    currentUser = { id: 'b1', email: 'b1@example.com' }
    await signSheet({ matchId: MATCH, side: 'b', playerId: 'b1', playerName: 'Bee One' })

    // `submit` genuinely moves the sheet's status, so it is a real UPDATE.
    db.deny = { scoresheets: (_row, op) => op === 'update' }

    const result = await submitSheet(MATCH)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('refused that change')
  })
})

describe('persist — writes only what RLS actually permits', () => {
  /**
   * The sheet is created by a duty official, but the INSERT policy
   * (`scoresheets_insert_duty_or_admin`, migration 0009) only lets them create
   * it with `status = 'draft'`. The first-ever command is `open`, which lands
   * on 'awaiting_signature' — so inserting the post-command status meant the
   * first write for every match was refused, and nothing could be signed.
   */
  it('creates the row as a draft, then moves it forward', async () => {
    const inserted: Row[] = []
    const real = db.from.bind(db)
    vi.spyOn(db, 'from').mockImplementation((table: string) => {
      const query = real(table)
      if (table !== 'scoresheets') return query
      const insert = query.insert.bind(query)
      query.insert = (payload: Row) => {
        inserted.push(payload)
        return insert(payload)
      }
      return query
    })

    const result = await openSheet(MATCH)
    vi.mocked(db.from).mockRestore()

    expect(result).toMatchObject({ ok: true, status: 'awaiting_signature' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].status).toBe('draft')
    expect(db.rows('scoresheets')[0].status).toBe('awaiting_signature')
  })

  /**
   * Signing changes no `scoresheets` column — it only adds a signature row.
   * The UPDATE policy allows admins, tabulators and the match's duty officials,
   * and by design the officials come from the *next* match on that court, so a
   * signing player is never one. Firing a no-op UPDATE anyway and treating its
   * zero rows as fatal meant no sheet could ever collect two signatures, and
   * nothing ever reached the tabulator.
   */
  it('does not update the sheet row when a player signs', async () => {
    await openForSignature()
    db.deny = { scoresheets: (_row, op) => op === 'update' }

    const first = await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    expect(first).toMatchObject({ ok: true })

    currentUser = { id: 'b1', email: 'b1@example.com' }
    const second = await signSheet({ matchId: MATCH, side: 'b', playerId: 'b1', playerName: 'Bee One' })
    expect(second).toMatchObject({ ok: true })

    expect(signatures()).toHaveLength(2)
  })

  it('does not update the sheet row when a signature is taken back', async () => {
    await openForSignature()
    await signSheet({ matchId: MATCH, side: 'a', playerId: 'a1', playerName: 'Ay One' })
    db.deny = { scoresheets: (_row, op) => op === 'update' }

    const result = await withdrawSignature(MATCH, 'a')
    expect(result).toMatchObject({ ok: true })
    expect(signatures()).toHaveLength(0)
  })
})

describe('run — the guards before anything is written', () => {
  it('refuses to open a sheet for a match still being played', async () => {
    seedMatch('in_progress')
    const result = await openSheet(MATCH)
    expect(result.ok).toBe(false)
    expect(db.rows('scoresheets')).toHaveLength(0)
  })

  it('refuses when nobody is signed in', async () => {
    currentUser = null
    const result = await openSheet(MATCH)
    expect(result).toMatchObject({ ok: false })
    expect(result.message).toContain('signed out')
  })

  it('refuses without a match id', async () => {
    expect(await openSheet('')).toMatchObject({ ok: false })
  })
})
