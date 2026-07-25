# Supabase Migrations — Couple Spending

SQL migrations for the couple-spending backend schema, Row Level Security
policies, and audit-log triggers. See [`DESIGN.md`](../../DESIGN.md) §4 (Data
Model) and §5 (RLS) for the full design rationale.

## Files

```
supabase/migrations/
├── 0001_init.sql   # all 5 tables, RLS, functions, triggers
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
- `join_household(invite_code)` — security-definer; the one legit cross-household
  path. Validates the code, enforces the ≤2 cap, inserts the caller's
  membership. Bypasses RLS.
- `enforce_household_member_cap` — BEFORE INSERT/UPDATE trigger on
  `household_members` that raises if a household would exceed 2 members.
- `bump_transactions_updated_at` / `bump_budgets_updated_at` — BEFORE UPDATE
  triggers that set `updated_at = now()` (last-write-wins key).
- `audit_transactions` / `audit_budgets` — AFTER INSERT/UPDATE/DELETE triggers
  that write one `audit_log` row per change (`old_values`/`new_values` via
  `to_jsonb`, `changed_by = auth.uid()`).

## How to apply

> **This migration has NOT been applied to a Supabase project yet.** Apply +
> test is deferred until the Supabase project is ready (issue #2 stays open).

### Option A — Supabase Studio SQL Editor (simplest)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Click **Run**. Re-running is safe (the file is idempotent).

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
   (`created_by = auth.uid()` and `user_id = auth.uid()` respectively).
3. The app shows the `invite_code` (or a `?invite=<code>` share link).
4. **Second user** signs up and calls `join_household(invite_code)`.
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
| `household_members` | `household_id = current_household_id()` | bootstrap: `user_id = auth.uid()` (own first membership); 2nd member via `join_household()` (definer, bypasses RLS) | `household_id = current_household_id()` | `household_id = current_household_id()` |
| `budgets` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` |
| `transactions` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` | `household_id = current_household_id()` |
| `audit_log` | `household_id = current_household_id()` | `household_id = current_household_id()` | **blocked** (no policy) | **blocked** (no policy) |

Key properties:

- **No cross-household reads or writes** are possible except via
  `join_household()` (security definer, which enforces the ≤2 cap).
- **`audit_log` is immutable** — it has only SELECT and INSERT policies; there
  are no UPDATE or DELETE policies, so those operations are denied.
- The audit triggers write `audit_log` rows via a security-definer function so
  the audit trail is recorded reliably on every transaction/budget change.
