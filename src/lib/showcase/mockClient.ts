/**
 * SHOWCASE-ONLY in-browser mock of the Supabase client.
 *
 * Activated ONLY when the app runs with VITE_SHOWCASE_MOCK=1 (see
 * ../supabase.ts). It implements just the surface this app uses -
 * PostgREST-style table queries with embedded relations, the RPCs the
 * pages call, the civil-auth edge function, and email-OTP session
 * handling - backed entirely by the fictional seed in ./mockData.ts.
 *
 * With the flag off (the default) this module is never selected and the
 * production Supabase client is used unchanged. No network calls are made
 * in mock mode and no real credentials are involved.
 */
import { ADMIN_ID, createMockTables, type MockRow } from './mockData';

/* ── small helpers ──────────────────────────────────────────────────── */
const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));

function getPath(row: MockRow, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as MockRow)[key];
    return undefined;
  }, row);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

/* ── select-spec parsing (PostgREST embedding syntax) ───────────────── */
interface EmbedSpec {
  alias: string;
  token: string; // table name or fk column, without !hint
  inner: boolean;
  subspec: string | null;
}

interface SelectSpec {
  star: boolean;
  columns: string[];
  embeds: EmbedSpec[];
}

function splitTopLevel(spec: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of spec) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseSelect(spec: string): SelectSpec {
  const result: SelectSpec = { star: false, columns: [], embeds: [] };
  for (const item of splitTopLevel(spec)) {
    if (item === '*') {
      result.star = true;
      continue;
    }
    const colon = item.indexOf(':');
    if (colon === -1) {
      result.columns.push(item);
      continue;
    }
    const alias = item.slice(0, colon).trim();
    let rest = item.slice(colon + 1).trim();
    let subspec: string | null = null;
    const open = rest.indexOf('(');
    if (open !== -1) {
      subspec = rest.slice(open + 1, rest.lastIndexOf(')'));
      rest = rest.slice(0, open);
    }
    const inner = rest.includes('!inner');
    const token = rest.split('!')[0].trim();
    result.embeds.push({ alias, token, inner, subspec });
  }
  return result;
}

/* ── relation resolution ────────────────────────────────────────────── */
const TABLE_BY_FK_COLUMN: Record<string, string> = {
  leadership_member_id: 'leadership_members',
  leave_type_id: 'leave_types',
  leave_id: 'leadership_leaves',
  sector_id: 'sectors',
  department_id: 'departments',
  assistant_undersecretary_id: 'assistant_undersecretaries',
  substitute_member_id: 'leadership_members',
  recipient_id: 'profiles',
  user_id: 'profiles',
  created_by: 'profiles',
};

const KNOWN_TABLES = new Set([
  'profiles',
  'assistant_undersecretaries',
  'sectors',
  'departments',
  'leave_types',
  'leadership_members',
  'leadership_leaves',
  'leave_notifications',
  'audit_logs',
]);

type Db = Record<string, MockRow[]>;

function resolveEmbed(
  db: Db,
  sourceTable: string,
  row: MockRow,
  embed: EmbedSpec,
): { value: MockRow | null; drop: boolean } {
  let targetTable: string | null = null;
  let fkColumn: string | null = null;

  if (KNOWN_TABLES.has(embed.token)) {
    targetTable = embed.token;
    const candidates = [`${embed.alias}_id`, `${embed.token.replace(/s$/, '')}_id`];
    fkColumn = candidates.find((c) => c in row) ?? null;
  } else if (embed.token in row || embed.token.endsWith('_id')) {
    fkColumn = embed.token;
    targetTable = TABLE_BY_FK_COLUMN[embed.token] ?? null;
  }

  if (!targetTable || !fkColumn) return { value: null, drop: embed.inner };
  const fkValue = row[fkColumn];
  if (fkValue === null || fkValue === undefined) return { value: null, drop: embed.inner };
  const target = (db[targetTable] ?? []).find((r) => r.id === fkValue);
  if (!target) return { value: null, drop: embed.inner };
  void sourceTable;
  return { value: applySpec(db, targetTable, clone(target), embed.subspec), drop: false };
}

function applySpec(db: Db, table: string, row: MockRow, specText: string | null): MockRow {
  if (specText === null) return row;
  const spec = parseSelect(specText);
  return projectRow(db, table, row, spec);
}

function projectRow(db: Db, table: string, row: MockRow, spec: SelectSpec): MockRow {
  const out: MockRow = {};
  if (spec.star) {
    for (const [k, v] of Object.entries(row)) out[k] = v;
  } else {
    for (const col of spec.columns) if (col in row) out[col] = row[col];
  }
  for (const embed of spec.embeds) {
    const { value } = resolveEmbed(db, table, row, embed);
    out[embed.alias] = value;
  }
  return out;
}

function embedRow(db: Db, table: string, row: MockRow, spec: SelectSpec): MockRow | null {
  const out: MockRow = { ...row };
  for (const embed of spec.embeds) {
    const { value, drop } = resolveEmbed(db, table, row, embed);
    if (drop) return null;
    out[embed.alias] = value;
  }
  return out;
}

/* ── query builder ──────────────────────────────────────────────────── */
type Filter =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is'; col: string; val: unknown }
  | { kind: 'in'; col: string; val: unknown[] }
  | { kind: 'or'; expr: string };

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

const ok = (data: unknown, count?: number | null): QueryResult => ({
  data,
  error: null,
  ...(count !== undefined ? { count } : {}),
});

class MockQuery implements PromiseLike<QueryResult> {
  private mode: 'read' | 'insert' | 'update' | 'delete' | 'upsert' = 'read';
  private payload: MockRow | MockRow[] | null = null;
  private selectSpec: string | null = null;
  private countOpt: string | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: Array<{ col: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private returning = false;

  constructor(
    private db: Db,
    private table: string,
  ) {}

  select(spec = '*', opts?: { count?: string; head?: boolean }) {
    if (this.mode === 'read') {
      this.selectSpec = spec;
      this.countOpt = opts?.count ?? null;
      this.head = opts?.head ?? false;
    } else {
      this.returning = true;
      this.selectSpec = spec;
    }
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push({ kind: 'eq', col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ kind: 'neq', col, val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ kind: 'gt', col, val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ kind: 'gte', col, val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ kind: 'lt', col, val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ kind: 'lte', col, val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ kind: 'in', col, val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ kind: 'is', col, val }); return this; }
  or(expr: string) { this.filters.push({ kind: 'or', expr }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  insert(rows: MockRow | MockRow[]) { this.mode = 'insert'; this.payload = rows; return this; }
  upsert(rows: MockRow | MockRow[]) { this.mode = 'upsert'; this.payload = rows; return this; }
  update(patch: MockRow) { this.mode = 'update'; this.payload = patch; return this; }
  delete() { this.mode = 'delete'; return this; }

  private matches(row: MockRow): boolean {
    return this.filters.every((f) => {
      if (f.kind === 'or') {
        return f.expr.split(',').some((clause) => {
          const m = clause.trim().match(/^([^.]+)\.eq\.(.+)$/);
          if (!m) return false;
          return String(getPath(row, m[1])) === m[2];
        });
      }
      const v = getPath(row, f.col);
      switch (f.kind) {
        case 'eq': return v === f.val;
        case 'neq': return v !== f.val;
        case 'gt': return v !== null && v !== undefined && compareValues(v, f.val) > 0;
        case 'gte': return v !== null && v !== undefined && compareValues(v, f.val) >= 0;
        case 'lt': return v !== null && v !== undefined && compareValues(v, f.val) < 0;
        case 'lte': return v !== null && v !== undefined && compareValues(v, f.val) <= 0;
        case 'in': return f.val.includes(v);
        case 'is': return v === f.val || (f.val === null && (v === null || v === undefined));
        default: return true;
      }
    });
  }

  private execute(): QueryResult {
    const tableRows = this.db[this.table] ?? (this.db[this.table] = []);

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload as MockRow];
      const now = new Date().toISOString();
      const inserted = inputs.map((input, i) => {
        const row: MockRow = {
          id: `gen-${Date.now()}-${i}`,
          created_at: now,
          updated_at: now,
          ...clone(input),
        };
        const existingIdx = tableRows.findIndex((r) => r.id === row.id);
        if (this.mode === 'upsert' && existingIdx >= 0) tableRows[existingIdx] = row;
        else tableRows.push(row);
        return row;
      });
      return ok(this.returning ? inserted.map((r) => ({ ...r })) : null);
    }

    if (this.mode === 'update') {
      const patch = this.payload as MockRow;
      const updated: MockRow[] = [];
      for (const row of tableRows) {
        if (this.matches(row)) {
          Object.assign(row, clone(patch), { updated_at: new Date().toISOString() });
          updated.push(row);
        }
      }
      return ok(this.returning ? updated.map((r) => ({ ...r })) : null);
    }

    if (this.mode === 'delete') {
      const kept: MockRow[] = [];
      const removed: MockRow[] = [];
      for (const row of tableRows) (this.matches(row) ? removed : kept).push(row);
      this.db[this.table] = kept;
      const data = this.returning ? removed.map((r) => ({ ...r })) : null;
      if (this.singleMode !== 'none') {
        return ok(data && data.length ? data[0] : null);
      }
      return ok(data);
    }

    // read
    const spec = parseSelect(this.selectSpec ?? '*');
    let rows: MockRow[] = [];
    for (const raw of tableRows) {
      const embedded = embedRow(this.db, this.table, clone(raw), spec);
      if (embedded) rows.push(embedded);
    }
    rows = rows.filter((r) => this.matches(r));
    const total = rows.length;
    for (const o of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        const c = compareValues(getPath(a, o.col), getPath(b, o.col));
        return o.ascending ? c : -c;
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    const projected = rows.map((r) => projectRow(this.db, this.table, r, spec));

    if (this.head) return ok(null, total);
    if (this.singleMode === 'single') {
      return projected.length
        ? ok(projected[0], this.countOpt ? total : undefined)
        : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    if (this.singleMode === 'maybe') return ok(projected[0] ?? null, this.countOpt ? total : undefined);
    return ok(projected, this.countOpt ? total : undefined);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}

/* ── RPCs ───────────────────────────────────────────────────────────── */
function reviewRecord(db: Db, leave: MockRow): MockRow {
  const member = (db.leadership_members ?? []).find((m) => m.id === leave.leadership_member_id);
  const type = (db.leave_types ?? []).find((t) => t.id === leave.leave_type_id);
  return {
    id: leave.id,
    member_name: member?.full_name ?? '',
    member_rank: member?.rank ?? '',
    leave_type: type?.name_ar ?? '',
    start_date: leave.start_date,
    end_date: leave.end_date,
    total_days: leave.total_days,
    status: leave.status,
    approval_status: leave.approval_status,
    workflow_status: leave.workflow_status,
    current_approval_stage: leave.current_approval_stage ?? null,
    rejection_reason: leave.rejection_reason ?? null,
    reviewed_at: leave.reviewed_at ?? null,
  };
}

function statusForDates(start: string, end: string): string {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (ymd < start) return 'upcoming';
  if (ymd > end) return 'completed';
  return 'active';
}

function handleRpc(db: Db, name: string, args: MockRow = {}): QueryResult {
  switch (name) {
    case 'my_permission_snapshot':
      // The showcase signs in as a full admin; AuthContext grants admins
      // every permission without consulting this snapshot.
      return ok([]);

    case 'review_queue_scoped': {
      const stage = args.p_stage as string;
      const leaves = (db.leadership_leaves ?? []).filter((l) => l.status !== 'cancelled');
      const visible =
        stage === 'minister'
          ? leaves.filter((l) => ['pending_stage_2', 'approved', 'rejected_stage_2'].includes(l.workflow_status as string))
          : leaves.filter((l) => l.workflow_status !== undefined);
      return ok(visible.map((l) => reviewRecord(db, l)));
    }

    case 'review_leave_stage': {
      const leave = (db.leadership_leaves ?? []).find((l) => l.id === args.p_leave_id);
      if (!leave) return { data: null, error: { message: 'leave not found' } };
      const stage = (leave.current_approval_stage as number) ?? 1;
      const now = new Date().toISOString();
      if (args.p_decision === 'approved') {
        if (stage === 1) {
          leave.workflow_status = 'pending_stage_2';
          leave.current_approval_stage = 2;
        } else {
          leave.workflow_status = 'approved';
          leave.approval_status = 'approved';
          leave.current_approval_stage = null;
          leave.status = statusForDates(leave.start_date as string, leave.end_date as string);
        }
      } else if (args.p_decision === 'rejected') {
        leave.workflow_status = stage === 1 ? 'rejected_stage_1' : 'rejected_stage_2';
        leave.approval_status = 'rejected';
        leave.current_approval_stage = null;
        leave.rejection_reason = (args.p_reason as string) ?? null;
      }
      leave.reviewed_by = ADMIN_ID;
      leave.reviewed_at = now;
      leave.updated_at = now;
      return ok(null);
    }

    case 'admin_reopen_leave': {
      const leave = (db.leadership_leaves ?? []).find((l) => l.id === args.p_leave_id);
      if (!leave) return { data: null, error: { message: 'leave not found' } };
      const target = (args.p_target_stage as number) ?? 1;
      leave.workflow_status = target === 1 ? 'pending_stage_1' : 'pending_stage_2';
      leave.approval_status = 'pending';
      leave.current_approval_stage = target;
      leave.rejection_reason = null;
      leave.updated_at = new Date().toISOString();
      return ok(null);
    }

    case 'admin_leave_timeline': {
      const leave = (db.leadership_leaves ?? []).find((l) => l.id === args.p_leave_id);
      if (!leave) return ok([]);
      const creator = (db.profiles ?? []).find((p) => p.id === leave.created_by);
      const events: MockRow[] = [
        {
          event_id: `${leave.id}-ev1`,
          event_at: leave.created_at,
          event_code: 'created',
          actor_id: leave.created_by,
          actor_name: creator?.full_name ?? null,
          from_state: null,
          to_state: 'pending_stage_1',
          details: null,
          source: 'recorded',
        },
      ];
      const wf = leave.workflow_status as string;
      if (['pending_stage_2', 'approved', 'rejected_stage_2'].includes(wf)) {
        events.push({
          event_id: `${leave.id}-ev2`,
          event_at: leave.reviewed_at ?? leave.updated_at,
          event_code: 'forwarded_to_minister',
          actor_id: ADMIN_ID,
          actor_name: 'منى خالد السالم',
          from_state: 'pending_stage_1',
          to_state: 'pending_stage_2',
          details: null,
          source: 'recorded',
        });
      }
      if (wf === 'approved') {
        events.push({
          event_id: `${leave.id}-ev3`,
          event_at: leave.reviewed_at ?? leave.updated_at,
          event_code: 'presented_to_minister',
          actor_id: ADMIN_ID,
          actor_name: 'منى خالد السالم',
          from_state: 'pending_stage_2',
          to_state: 'approved',
          details: null,
          source: 'recorded',
        });
      }
      if (wf === 'rejected_stage_1' || wf === 'rejected_stage_2') {
        events.push({
          event_id: `${leave.id}-ev3`,
          event_at: leave.reviewed_at ?? leave.updated_at,
          event_code: 'archived_at_stage',
          actor_id: ADMIN_ID,
          actor_name: 'منى خالد السالم',
          from_state: wf === 'rejected_stage_1' ? 'pending_stage_1' : 'pending_stage_2',
          to_state: wf,
          details: leave.rejection_reason ? { reason: leave.rejection_reason } : null,
          source: 'recorded',
        });
      }
      return ok(events);
    }

    case 'update_my_name': {
      const profile = (db.profiles ?? []).find((p) => p.id === ADMIN_ID);
      if (profile) profile.full_name = args.p_full_name as string;
      return ok(null);
    }

    case 'has_my_civil_credential':
      return ok(true);

    case 'create_registration_invite':
      return ok(new Date(Date.now() + 7 * 86_400_000).toISOString());

    case 'admin_list_user_permissions': {
      const grantsByUser: Record<string, MockRow[]> = {
        'u-approver': [
          { account_type: 'approver', permission_code: 'view_leaders', scope_kind: 'all', scope_id: null },
          { account_type: 'approver', permission_code: 'view_leaves', scope_kind: 'all', scope_id: null },
          { account_type: 'approver', permission_code: 'approve_undersecretary', scope_kind: 'all', scope_id: null },
        ],
        'u-staff': [
          { account_type: 'user', permission_code: 'view_leaders', scope_kind: 'all', scope_id: null },
          { account_type: 'user', permission_code: 'view_leaves', scope_kind: 'all', scope_id: null },
          { account_type: 'user', permission_code: 'create_leave', scope_kind: 'all', scope_id: null },
          { account_type: 'user', permission_code: 'edit_leader', scope_kind: 'all', scope_id: null },
        ],
        'u-staff-2': [
          { account_type: 'user', permission_code: 'view_leaders', scope_kind: 'all', scope_id: null },
          { account_type: 'user', permission_code: 'view_reports', scope_kind: 'all', scope_id: null },
        ],
      };
      return ok(grantsByUser[args.p_user_id as string] ?? []);
    }

    case 'admin_replace_user_access':
      return ok(null);

    default:
      return ok(null);
  }
}

/* ── auth + edge functions ──────────────────────────────────────────── */
const SESSION_KEY = 'showcase-mock-session';

const mockUser = {
  id: ADMIN_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@leave-system.example',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'منى خالد السالم' },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function buildSession() {
  return {
    access_token: 'showcase-mock-access-token',
    refresh_token: 'showcase-mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: mockUser,
  };
}

type AuthListener = (event: string, session: unknown) => void;

class MockAuth {
  private listeners = new Set<AuthListener>();

  private currentSession(): ReturnType<typeof buildSession> | null {
    try {
      return window.localStorage.getItem(SESSION_KEY) === '1' ? buildSession() : null;
    } catch {
      return null;
    }
  }

  private notify(event: string) {
    const session = this.currentSession();
    this.listeners.forEach((cb) => {
      try {
        cb(event, session);
      } catch {
        /* listener errors are swallowed like the real client */
      }
    });
  }

  async getSession() {
    return { data: { session: this.currentSession() }, error: null };
  }

  async getUser() {
    const session = this.currentSession();
    return { data: { user: session?.user ?? null }, error: null };
  }

  onAuthStateChange(cb: AuthListener) {
    this.listeners.add(cb);
    const session = this.currentSession();
    window.setTimeout(() => cb('INITIAL_SESSION', session), 0);
    return {
      data: {
        subscription: {
          id: 'showcase-mock-subscription',
          callback: cb,
          unsubscribe: () => this.listeners.delete(cb),
        },
      },
    };
  }

  async verifyOtp() {
    try {
      window.localStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* storage unavailable - session still works for this page load */
    }
    const session = buildSession();
    this.notify('SIGNED_IN');
    return { data: { session, user: mockUser }, error: null };
  }

  async signOut() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    this.notify('SIGNED_OUT');
    return { error: null };
  }

  async refreshSession() {
    return { data: { session: this.currentSession(), user: mockUser }, error: null };
  }

  async updateUser(patch: MockRow) {
    Object.assign(mockUser.user_metadata, (patch?.data as MockRow) ?? {});
    return { data: { user: mockUser }, error: null };
  }
}

/* ── client factory ─────────────────────────────────────────────────── */
export function createShowcaseMockClient() {
  const db = createMockTables();
  const auth = new MockAuth();

  return {
    auth,
    from: (table: string) => new MockQuery(db, table),
    rpc: (name: string, args?: MockRow) => Promise.resolve(handleRpc(db, name, args ?? {})),
    functions: {
      invoke: async (name: string, opts?: { body?: MockRow }) => {
        if (name === 'civil-auth') {
          const action = opts?.body?.action as string | undefined;
          if (action === 'login') return { data: { token_hash: 'showcase-mock-token' }, error: null };
          return { data: { success: true }, error: null };
        }
        return { data: { success: true }, error: null };
      },
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: async () => ({ error: null }),
  };
}
