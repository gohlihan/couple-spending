# Couple Spending — Design Doc

A progressive web app (PWA) for a couple to record a shared monthly budget and
their day-to-day spending, designed to run fluently on iOS (offline-first,
installable). Both partners see the same data in real time.

---

## 1. Goals & Success Criteria

**Primary job-to-be-done:** *Shared visibility* — both partners see the same
budget + spending to stay aligned and see where the money goes.

**Success criteria (v1):**
- Either partner can set the monthly budget; both record spending into the
  shared pool.
- Each transaction is logged with near-zero friction (amount → time → note/chip).
- Spending is shown as a **waterfall timeline** that depletes the monthly budget.
- Month-end auto-closes and resets the budget; any month is viewable/editable
  via a top date bar.
- Works **offline**; writes queue locally and sync to the cloud on reconnect.
- Two linked accounts (one household), isolated from everyone else's data.

**Non-goals (v1):** per-category limits, rollover, who-paid splitting, presence
bubbles, an audit-trail viewer UI, analytics/insights. *(These are fast-follows.)*

---

## 2. Architecture Overview

```
┌─────────────────────────────── iOS Safari / installed PWA ───────────────────────────────┐
│  Vite + React SPA  (vite-plugin-pwa: service worker + manifest, installable, offline cache) │
│                                                                                              │
│   UI (waterfall, date bar, add-txn form, budget settings)                                    │
│        │  reads/writes                                                                        │
│        ▼                                                                                      │
│   Dexie (IndexedDB)  ── local source of truth ──┐                                            │
│        │  write queue                            │                                            │
│        ▼                                         │ realtime subscribe                         │
│   Sync Engine (drain queue on reconnect)         │ (live updates when partner online)        │
│        │  upsert/delete (client_id idempotent)   │                                            │
└────────┼─────────────────────────────────────────┼────────────────────────────────────────────┘
         ▼                                         ▼
┌──────────────── Supabase (managed BaaS) ─────────────────┐
│  Postgres  (households, household_members, transactions, │
│             budgets, audit_log)                            │
│  Auth      (email/password)                                │
│  Realtime  (broadcast/presence + row changes)             │
│  RLS       (all rows scoped by household_id)              │
└────────────────────────────────────────────────────────────┘
```

**Frontend stack:** Vite **8** + React + TypeScript, `vite-plugin-pwa@^1.3.0`
(service worker / web manifest / installability), Dexie for IndexedDB local
store + write queue, `@supabase/supabase-js` for auth + DB + realtime.
**Linter:** oxlint (create-vite template default) + Prettier. **Package manager:**
npm (pnpm unavailable on the build machine; `package-lock.json` committed).

> **Phase 0 actuals (scaffold shipped, PR #9):** the create-vite react-ts
template now ships **Vite 8**, which forced `vite-plugin-pwa` to the **1.x** line
(the 0.21.x line peer-depends on Vite ≤6 and is incompatible). The template
also ships **oxlint** (not eslint). npm was used throughout (pnpm unavailable).
`npm audit` reports 8 high-severity transitive vulns on the fresh scaffold —
not blocking; review before later phases.

**Backend:** Supabase (hosted Postgres + Auth + Realtime). No custom server —
the SPA talks to Supabase directly over HTTPS, gated by Row Level Security.

**Why this shape:**
- 2-user authed app ⇒ no SSR needed; a static SPA is the smallest, fastest bundle.
- Offline-first ⇒ a local store (Dexie) is the source of truth for reads; a
  write queue bridges to Supabase when online.
- Shared visibility ⇒ Supabase Realtime pushes the partner's changes into Dexie
  and the UI live.

---

## 3. Core Product Logic

### 3.1 Couple / finance model
- One **shared** monthly budget (not his/hers). Either partner can set or edit
  the budget amount.
- Both partners record spending into the **single shared pool**. Every
  transaction depletes the one total budget (no per-category limits).
- Each transaction **auto-stamps `created_by`** = the logged-in user who added
  it. Zero added friction; gives an audit trail and lets the waterfall show
  "who entered it." **Requires two logins.**

### 3.2 Budgeting approach
- **Monthly cycle:** month-end **auto-closes** the month and **resets** the
  spending counter to zero. The budget *amount* **carries forward** unchanged
  unless someone edits it in budget settings.
- **No rollover:** unspent / overspent does NOT carry into the next month. Each
  month is a clean slate at the fixed budget amount.
- **Single pool:** no category limits. Quick-input chips (eat/shop/petrol) are
  *soft tags* for future insight, not structured categories with limits.

### 3.3 Input workflow
- **Amount** (required) → **timestamp** (defaults to system *now*; tap to pick
  another date/time) → optional **note** with **quick-input chips**
  (eat, shop, petrol, …). Minimal fields = low friction = daily adoption.

### 3.4 Display
- **Waterfall timeline:** chronological stream of transactions with the monthly
  budget depleting as each spend lands; can show who entered each entry.
- **Top date bar:** click to select any month to view & edit; defaults to the
  current month.

### 3.5 Month-end / edit policy
- Past months **never lock**. Either partner can add/edit/delete transactions
  in any prior month; the waterfall recalculates live. "Close" just means the
  month scrolled off, not that it's frozen.
- **BUT** edits/deletes are flagged with a **full audit trail** (preserve the
  original values + a change record: who / when / what changed).
- Either partner can edit/delete **any** transaction (own or the other's); the
  audit trail records who/when/what.

### 3.6 iOS offline behavior
- **Offline-first:** reads/writes work offline. A local Dexie store + write
  queue sync to Supabase on reconnect.
- **Conflict resolution:** last-write-wins, keyed on per-row `updated_at`; the
  audit trail preserves overwritten history so nothing is ever truly lost.

### 3.7 Auth & couple-linking
- **Email/password** via Supabase Auth.
- **Invite code** linking: first user signs up → creates a household → gets an
  invite code/link → second user signs up and enters the code to join the same
  household. The two auth users share a `household_id`; RLS scopes all data to it.

---

## 4. Data Model (Postgres / Supabase)

All tenant tables carry a `household_id` so RLS can scope every row to the
linked couple.

### 4.1 `households`
| column         | type           | notes                                              |
|----------------|----------------|----------------------------------------------------|
| `id`           | uuid pk        | `gen_random_uuid()`                                |
| `name`         | text           | optional, e.g. "Han & Partner"                     |
| `invite_code`  | text unique    | generated on creation; used by 2nd user to join   |
| `created_by`   | uuid → auth.users | creator                                         |
| `created_at`   | timestamptz    | default now()                                      |

### 4.2 `household_members` (links auth users → household; max 2)
| column        | type              | notes                                            |
|---------------|-------------------|--------------------------------------------------|
| `id`          | uuid pk           |                                                  |
| `household_id`| uuid → households | on delete cascade                                |
| `user_id`     | uuid → auth.users | on delete cascade                                |
| `display_name`| text              | "Han" / "Partner" shown in waterfall + audit     |
| `joined_at`   | timestamptz       | default now()                                    |
|               | unique(household_id, user_id) |                                    |
|               | **CHECK/constraint: ≤ 2 members per household** (trigger-enforced) | |

### 4.3 `budgets` (one current budget per household)
| column        | type              | notes                                            |
|---------------|-------------------|--------------------------------------------------|
| `id`          | uuid pk           |                                                  |
| `household_id`| uuid → households | **unique** — one current budget per household     |
| `amount`      | numeric(12,2)     | not null                                          |
| `updated_at`  | timestamptz       | default now() — last-write-wins key              |
| `updated_by`  | uuid → auth.users |                                                  |

Budget edits are also recorded in `audit_log`. Carries forward: a single row
per household is the "current" amount; month reset does not touch it.

### 4.4 `transactions`
| column        | type              | notes                                            |
|---------------|-------------------|--------------------------------------------------|
| `id`          | uuid pk           | `gen_random_uuid()`                              |
| `household_id`| uuid → households | RLS scope                                        |
| `amount`      | numeric(12,2)     | not null                                          |
| `spent_at`    | timestamptz       | user-chosen timestamp; defaults to now() at entry|
| `note`        | text              | optional                                          |
| `chip`        | text              | optional soft tag: 'eat'/'shop'/'petrol'          |
| `created_by`  | uuid → auth.users | who entered it (auto-stamped)                     |
| `created_at`  | timestamptz       | default now()                                     |
| `updated_at`  | timestamptz       | default now() — last-write-wins key              |
| `updated_by`  | uuid → auth.users |                                                  |
| `deleted_at`  | timestamptz       | nullable — soft delete                           |
| `deleted_by`  | uuid → auth.users | nullable                                          |
| `client_id`   | text unique       | client-generated id for offline-queue idempotency|
|               | index(household_id, spent_at desc) | for waterfall + month filter      |

### 4.5 `audit_log` (immutable history of edits/deletes)
| column        | type              | notes                                            |
|---------------|-------------------|--------------------------------------------------|
| `id`          | uuid pk           |                                                  |
| `household_id`| uuid → households | RLS scope                                        |
| `table_name`  | text              | 'transactions' / 'budgets'                       |
| `record_id`   | uuid              | affected row's id                                 |
| `action`      | text              | 'INSERT' / 'UPDATE' / 'DELETE'                    |
| `old_values`  | jsonb             | snapshot before change                           |
| `new_values`  | jsonb             | snapshot after change                            |
| `changed_by`  | uuid → auth.users | who changed it                                    |
| `changed_at`  | timestamptz       | default now()                                    |
|               | index(household_id, record_id, changed_at) |                          |

`audit_log` is **append-only** (INSERT only via RLS; no UPDATE/DELETE).

---

## 5. Row Level Security (RLS)

Enable RLS on every tenant table. Core policy pattern:

```sql
-- helper: the current user's household
create or replace function public.current_household_id()
returns uuid language sql stable security definer as $$
  select household_id from public.household_members
  where user_id = auth.uid() limit 1;
$$;

-- example policy (transactions): full access within your own household
create policy "txns: household-scoped" on public.transactions
  for all using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
```

- `households`, `household_members`, `budgets`, `audit_log` get analogous
  household-scoped SELECT; INSERT/UPDATE checks enforce `household_id` matches
  the caller's membership.
- `audit_log`: INSERT-only (no UPDATE/DELETE) to guarantee immutability.
- **Household join via invite code:** a `security definer` function
  `join_household(invite_code text)` validates the code, checks the household has
  < 2 members, and inserts a `household_members` row for `auth.uid()`. This is
  the one path that lets a user cross the household boundary (legitimately).
- `household_members` membership cap (≤ 2): enforced by a trigger on insert.

**Hardening notes (must get right):** financial data ⇒ RLS must be airtight.
Every policy must use `current_household_id()` for both `using` (visibility)
and `with check` (write validity). Audit `audit_log` policy to confirm no cross-
household reads/writes are possible.

---

## 6. Offline-First Sync Design

### 6.1 Local store (Dexie / IndexedDB)
Mirrors the server tables the app reads:
- `transactions` (household's txns)
- `budgets` (current budget)
- `pending_changes` (the write queue)

### 6.2 Write path (online or offline)
1. User adds/edits/deletes a transaction (or edits the budget).
2. Write lands in local Dexie immediately ⇒ **UI updates instantly**.
3. A row is appended to `pending_changes`:
   `{ client_id, op, table, record_id, payload, created_at, status, attempts }`.
4. If online, the sync engine drains the queue right away; if offline, it waits
   for the `online` event.

### 6.3 Sync engine (drain queue)
- For each pending change: call the matching Supabase upsert/delete, keyed by
  `client_id` (idempotent — safe to retry).
- On success: mark the queue row `synced`.
- On failure: increment `attempts`; retry with backoff; surface a "sync failed"
  indicator after N attempts.

### 6.4 Conflict resolution (last-write-wins)
- Every transaction/budget row carries `updated_at`. The client always sends
  `updated_at = now()` for the write it is performing.
- Last-write-wins: the row with the latest `updated_at` wins. If two partners
  edit the same transaction offline and both sync, the later `updated_at` wins.
- The **audit trail preserves the overwritten version's history** (`old_values`),
  so nothing is ever truly lost; a future "conflict noticed" affordance
  (fast-follow) can surface when an incoming realtime change clobbers a local
  edit.

### 6.5 Realtime inbound (live shared visibility)
- Subscribe to Supabase Realtime on `transactions` + `budgets` for the
  household (`household_id = current_household_id()`).
- On inbound change: upsert/delete in Dexie and the UI reacts live.
- Presence/broadcast channels (fast-follow): a live bubble shows what the
  partner is currently doing. Not in v1.

### 6.6 iOS PWA constraints
- `vite-plugin-pwa` generates the service worker (precaches the app shell) +
  web manifest (installable, standalone display).
- IndexedDB may be evicted under storage pressure on iOS; the local store must
  be **re-derivable** from Supabase (re-fetch the household's data on cold
  start). IndexedDB is a cache, not the only source of truth — Supabase is.

---

## 7. Key Decisions & Tradeoffs

| Decision | Choice | Tradeoff |
|----------|--------|----------|
| Primary job | Shared visibility | Deprioritizes enforcement/splitting (deferred) |
| Finance model | Single shared pool, auto-stamp `created_by` | Forces two logins (more secure for financial data) |
| Budget granularity | Single pool, optional soft chips | Less control than categories; lowest input friction |
| Rollover | None | Simpler math; ignores surplus/deficit carryover |
| Month edit policy | Fully editable + audit trail | Flexibility over hard lock; audit trail is the safety net |
| Hosting | Managed BaaS (Supabase) | Near-zero ops; data on their cloud (RLS isolates couple) |
| Auth | Email/password | Familiar, offline-friendly; no biometric (could add passkey later) |
| Couple linking | Invite code | Simple, manual; one-time step |
| Offline | Offline-first + write queue | Best UX; extra sync/conflict engineering |
| Conflict | Last-write-wins + audit trail | May silently overwrite a concurrent edit; audit trail preserves history |
| Stack | Vite + React + vite-plugin-pwa + Dexie | Smallest PWA bundle; React ecosystem; no SSR |

---

## 8. Risks & Mitigations

- **RLS misconfiguration** ⇒ financial data leak. *Mitigation:* all policies use
  `current_household_id()` for `using` + `with check`; `audit_log` INSERT-only;
  integration-test cross-household denial.
- **Offline last-write-wins silently overwrites** a concurrent partner edit.
  *Mitigation:* audit trail preserves history; (fast-follow) surface a
  "conflict noticed" indicator when realtime clobbers a local edit.
- **iOS IndexedDB eviction** under storage pressure. *Mitigation:* treat Dexie
  as a re-derivable cache; re-fetch household data on cold start from Supabase.
- **Audit log grows unbounded.** *Mitigation:* defer; add retention/purge policy
  later.
- **Token / session on offline PWA.** *Mitigation:* Supabase persists the
  session; refresh-token flow must work offline-first (test cold start offline).

---

## 9. MVP Scope (v1) & Fast-Follow

**v1 = core loop only:**
1. Auth + invite-code household linking
2. Add transaction (amount / time / note / chips), auto-stamp `created_by`
3. Waterfall timeline + month date bar
4. Budget setting (edit amount; carries forward)
5. Offline-first sync (Dexie + write queue → Supabase; last-write-wins)
6. Edit/delete + audit-trail *recording* (viewer UI later)

**Fast-follow (post-v1):**
- Presence bubble (Supabase Realtime broadcast/presence)
- Audit-trail viewer UI
- Insights / analytics (e.g. monthly trends, chip breakdown)
- Custom quick-input chips, audit-log retention policy, passkey login
