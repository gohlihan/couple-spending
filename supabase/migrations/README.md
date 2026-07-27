# Supabase Migrations — Couple Spending

SQL migrations for the couple-spending backend schema, Row Level Security
policies, and audit-log triggers. See [`DESIGN.md`](../../DESIGN.md) §4 (Data
Model) and §5 (RLS) for the full design rationale.

## Files

```
supabase/migrations/
├── 0001_init.sql   # all 5 tables, RLS, functions, triggers
├── 0002_auto_stamp_defaults.sql # auth-derived default stamps
├── 0003_realtime_publication.sql # Realtime publication + replica identity
├── 0004_sync_version_ordering.sql # client LWW trigger ordering
├── 0005_security_hardening.sql # membership, audit, and actor-write hardening
└── README.md       # this file
```

## What `0001_init.sql` creates

**Tables** (all tenant-scoped by `household_id`):

| Table | Purpose |
|-------|---------|
| `households` | One per couple; holds the `invite_code` used to link the 2nd partner. |
| `household_members` | Links auth users → household (max **2** per household, trigger-enforced). |
| `budgets` | The shared monthly budget (one row per household — `household_id` is unique). |
| `transactions` | Every spend: amount, `spent_at`, note, chip, soft-delete, `client_id` for offline idempotency. |
| `audit_log` | Immutable history of inserts/updates/deletes on transactions & budgets. |

**Functions / triggers:**

- `current_household_id()` — security-definer helper returning the caller's
  household; used by every RLS policy.
- `join_household(p_invite_code)` — security-definer; the one legit cross-household
  path. Validates the code, enforces the ≤2 cap, inserts the caller's
  membership. Bypasses RLS.
- `enforce_household_member_cap` — BEFORE INSERT/UPDATE trigger on
  `household_members` that raises if a household would exceed 2 members.
- `bump_transactions_updated_at` / `bump_budgets_updated_at` — BEFORE UPDATE
  triggers that preserve the client `updated_at` conflict key, order equal
  timestamps by `updated_by`, and skip stale updates (the 0004 migration
  supplies `now()` only for an explicit NULL). An exactly equal timestamp and
  writer is treated as the existing version because no further sequence exists.
- `audit_transactions` / `audit_budgets` — AFTER INSERT/UPDATE/DELETE triggers
  that write one `audit_log` row per change (`old_values`/`new_values` via
  `to_jsonb`, `changed_by = auth.uid()`).

## Realtime publication (0003), version ordering (0004), and security hardening (0005)

`0003_realtime_publication.sql` adds `public.transactions` and `public.budgets`
to the managed `supabase_realtime` publication and sets `REPLICA IDENTITY FULL`.
The latter requests old-row values for UPDATE/DELETE events, but Supabase
documents that RLS-protected DELETE payloads may still contain only the
primary key(s), and DELETE events cannot be filtered. The sync engine therefore
subscribes to INSERT/UPDATE with the household filter, subscribes to DELETE
without a filter, and re-fetches incomplete DELETEs through the authenticated
household-scoped SELECT before mutating Dexie. A complete DELETE payload still
uses the version-aware LWW path. The migration checks `pg_publication_tables`
before adding each table, so it is safe to rerun and does not require a
dashboard-only configuration step.

`0004_sync_version_ordering.sql` is a forward migration for environments where
an earlier `0003` was already applied. It updates the shared timestamp trigger
to compare `updated_by` when timestamps tie and skips stale writes. Fresh
installs must apply both migrations in numeric order.

`0005_security_hardening.sql` binds direct membership bootstrap inserts to the
creator's own new household, restricts member edits to a user's own display
name, serializes the two-member cap, removes client audit-log writes, and
server-stamps transaction/budget actor columns.

## How to apply

> Apply the migrations in numeric order to each Supabase project. Existing
> environments that already have `0001` and `0002` need `0003`, `0004`, and
> `0005`. Environments that already applied an earlier `0003` need `0004` and
> `0005` as forward updates.

### Option A — Supabase Studio SQL Editor (simplest)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Run `0001_init.sql`, then `0002_auto_stamp_defaults.sql`, then
   `0003_realtime_publication.sql`, `0004_sync_version_ordering.sql`, and
   `0005_security_hardening.sql` in order.
3. Click **Run** after each migration. The migrations are safe to re-run where
   their SQL comments/documentation say they are idempotent.

### Option B — Supabase CLI (`supabase db push`)

If the Supabase CLI is linked to your project:

```bash
supabase db push
```

The CLI picks up files under `supabase/migrations/` and applies them in order.

## Invite-code flow

1. **First user** signs up (email/password via Supabase Auth).
2. The app creates a `households` row (generates a unique `invite_code`) and a
   `household_members` row for the creator (`created_by` / `user_id` =
   `auth.uid()`). Both inserts are allowed by the RLS bootstrap policies
   (`created_by = auth.uid()` and the creator's own new household respectively).
3. The app shows the `invite_code` (or a `?invite=<code>` share link).
4. **Second user** signs up and calls `join_household(p_invite_code)`.
   `join_household` is `security definer`, so it bypasses RLS to insert the
   2nd membership. It rejects a 3rd joiner and a bad code.
5. Both users now share a `household_id`; all data is scoped to it via RLS.

## RLS guarantees

Row Level Security is **enabled on all five tables**. Every policy uses
`current_household_id()` for both `using` (visibility) and `with check` (write
validity), with two documented bootstrap exceptions:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `households` | `id = current_household_id()` | bootstrap: `created_by = auth.uid()` (creator's first household) | `id = current_household_id()` | **blocked** (no policy) |
| `household_members` | `household_id = current_household_id()` | bootstrap: creator's own new household; 2nd member via `join_household()` (definer, bypasses RLS) | own `display_name` only | **blocked** (no policy) |
| `budgets` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` |
| `transactions` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` |
| `audit_log` | `household_id = current_household_id()` | **trigger-only** (no client policy) | **blocked** (no policy) | **blocked** (no policy) |

Key properties:

- **No cross-household reads or writes** are possible except via
  `join_household()` (security definer, which enforces the ≤2 cap).
- **`audit_log` is immutable and trigger-only** — clients have SELECT access,
  while security-definer mutation triggers are the only INSERT path; there are
  no UPDATE or DELETE policies.
- The audit triggers write `audit_log` rows via a security-definer function so
  the audit trail is recorded reliably on every transaction/budget change.
