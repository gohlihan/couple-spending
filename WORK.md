# Couple Spending — Implementation Plan (WORK.md)

Step-by-step build plan for v1 (the core loop). Each phase is one trackable
GitHub issue. See the **Sub-agent GitHub workflow** section at the end for the
git/branch/worktree/commit/PR conventions every builder must follow.

Architecture, data model, RLS, and decisions live in [`DESIGN.md`](./DESIGN.md).
This plan references it but does not repeat the rationale.

---

## Status / Progress

> Living tracker — updated as phases complete. See the phases table below for
> per-phase state.

| Phase | Issue | State | Branch / PR |
|-------|-------|-------|-------------|
| 0 — Scaffold | #1 | ✅ **DONE** (PR #9 open) | `feat/issue-1-scaffold` → [PR #9](https://github.com/gohlihan/couple-spending/pull/9) |
| 1 — Supabase schema + RLS | #2 | ✅ **DONE** (PR #10 merged) | `feat/issue-2-supabase-schema-rls` → [PR #10](https://github.com/gohlihan/couple-spending/pull/10) |
| 2 — Auth + invite | #3 | ⬜ pending | — |
| 3 — Add-transaction form | #4 | ⬜ pending | — |
| 4 — Waterfall + date bar | #5 | ⬜ pending | — |
| 5 — Budget setting | #6 | ⬜ pending | — |
| 6 — Offline sync queue | #7 | ⬜ pending | — |
| 7 — Edit/delete + audit | #8 | ⬜ pending | — |

### Stack actuals (from Phase 0)

- **Vite 8** (create-vite react-ts template default, not 5/6)
- **vite-plugin-pwa@^1.3.0** — the 0.21.x line peer-depends on Vite ≤6 and is
  **incompatible with Vite 8**; the 1.x line supports Vite 8.
- **oxlint** (template default, `.oxlintrc.json`) + Prettier — **not** eslint
- **npm** (pnpm unavailable on the build machine); `package-lock.json` committed
- `npm audit`: **8 high-severity transitive vulns** on the fresh scaffold — not
  Phase-0-blocking; review before later phases.

### Phase 1 readiness (#2) — resolved

Phase 1 (Supabase schema + RLS) needs a **Supabase project** (URL + anon key) to
apply + test migrations against. **Resolved:** validated against the live
Supabase project `hxhzxkhdqfhznwdiugxz` — migration applied, cross-household RLS
denial + `join_household` ≤2-member cap + audit triggers confirmed (a
param/column-name collision in `join_household` was fixed by renaming the
parameter `invite_code` → `p_invite_code` and schema-qualifying the column).
Merged via PR #10 (squash); issue #2 closed.

---

## V1 Build Phases

| Phase | Issue | Title | Depends on |
|-------|-------|-------|------------|
| 0 | #1 | ✅ Scaffold: Vite + React + TS + PWA plugin + Dexie + supabase-js | — |
| 1 | #2 | Supabase schema, RLS policies, audit-log trigger | 0 |
| 2 | #3 | Auth + invite-code household linking | 1 |
| 3 | #4 | Add-transaction form + local Dexie write | 2 |
| 4 | #5 | Waterfall timeline + month date bar | 3 |
| 5 | #6 | Budget setting (edit amount; carries forward) | 4 |
| 6 | #7 | Offline-first sync queue + realtime inbound | 4 |
| 7 | #8 | Edit/delete + audit trail | 6 |

Phases 3–7 can partially overlap, but keep the dependency order: schema+auth
before any data UI; the waterfall before budget setting (same view); the sync
queue before edit/delete (so writes are resilient first).

---

### Phase 0 — Scaffold (#1) ✅

**State:** DONE — branch `feat/issue-1-scaffold`, [PR #9](https://github.com/gohlihan/couple-spending/pull/9)
(open, not yet merged). Validation passed: `npm run build` → `dist/` with
`sw.js` + `workbox-*.js` + `registerSW.js` + `manifest.webmanifest` (installable);
`npm run dev` serves on :5173; `.env.local` gitignored; 4 docs preserved.

**Actuals (deviations from the original steps below):**
- **npm** used (pnpm unavailable) → `package-lock.json` committed.
- **Vite 8** shipped by the template → required **`vite-plugin-pwa@^1.3.0`**
  (0.21.x is incompatible with Vite 8).
- **oxlint** (`.oxlintrc.json`) replaced eslint as the template default; Prettier
  added on top.
- Removed unused demo assets (react/vite logos) for a clean minimal shell.
- `npm audit`: 8 high-sev transitive vulns (non-blocking; review pre-Phase-1).

**Scope (original):** Empty repo → runnable, installable PWA shell. No business logic.

**Steps:**
1. `npm create vite@latest . -- --template react-ts` (or pnpm).
2. Install deps: `dexie`, `@supabase/supabase-js`, `vite-plugin-pwa`.
3. Configure `vite.config.ts` with `VitePWA({ registerType: 'autoUpdate',
   manifest: { name, short_name, theme_color, display: 'standalone' },
   workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] } })`.
4. Add `src/lib/supabase.ts` (reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   from `.env.local`), `src/lib/db.ts` (Dexie schema stub), `src/App.tsx` shell.
5. Add `.env.example`, `.gitignore` (node_modules, dist, .env.local).
6. Add an **oxlint** + `prettier` baseline; a `npm run dev` / `npm run build` that works.
7. Commit `.env.example` with placeholders; **never** commit real keys.

**Validation:**
- `npm run dev` serves the app; `npm run build` produces a `dist/` with a service
  worker + manifest.
- Lighthouse PWA check passes (installable).
- `.env.local` is gitignored.

---

### Phase 1 — Supabase schema + RLS (#2)

**Scope:** Define all tables, RLS, the invite-code join function, and the
audit-log trigger. Deliver as a versioned migration (Supabase `supabase/migrations`
or a hand-written `schema.sql` checked in).

**Tables** (see DESIGN.md §4): `households`, `household_members` (≤2 constraint),
`budgets`, `transactions`, `audit_log`.

**Key SQL:**
- `current_household_id()` helper (security definer).
- RLS enabled on all tenant tables; `using` + `with check` both reference
  `current_household_id()`.
- `audit_log`: INSERT-only (no UPDATE/DELETE policies).
- `join_household(invite_code text)` security-definer function: validate code,
  enforce ≤2 members, insert `household_members` for `auth.uid()`.
- Trigger on `transactions` + `budgets`: after INSERT/UPDATE/DELETE, write a row
  to `audit_log` capturing `old_values`/`new_values`, `changed_by = auth.uid()`.
- `transactions.updated_at` auto-bump trigger on UPDATE.

**Validation:**
- Apply migration to a fresh Supabase project; `psql` confirms tables + policies.
- Negative test: a second household's user cannot SELECT/INSERT the first's rows
  (RLS denies).
- `join_household` rejects a 3rd joiner; rejects a bad code.
- Edit a transaction ⇒ a matching `audit_log` row appears with correct old/new.

---

### Phase 2 — Auth + invite-code household linking (#3)

**Scope:** Sign up / log in (email+password), create household + invite code,
join via invite code. UI + flow + session persistence.

**Steps:**
1. Auth screens: sign up, log in, "join with invite code".
2. On first-user signup: create `households` row (generate `invite_code`),
   insert `household_members` (creator), set the default budget row (prompt for
   amount, or a sensible default editable later).
3. Invite screen: show the code + a shareable link
   (`?invite=<code>`); the 2nd user's "join" flow reads the code and calls
   `join_household(code)`.
4. Persist Supabase session (works offline-first on cold start).
5. Guard the app: no household membership ⇒ route to signup/join.

**Validation:**
- Two real accounts can sign up; user A creates household + code; user B joins
  with the code; both now share a `household_id`.
- A 3rd signup with the same code is rejected.
- Cold-starting the PWA offline restores the session (no forced re-login).

---

### Phase 3 — Add-transaction form (#4)

**Scope:** The input form + local write (no remote sync yet — Phase 6 wires it).

**UI:** Amount (required, numeric) → timestamp (defaults to `now`; tap to pick
date/time) → optional note + quick-input chips (`eat`, `shop`, `petrol`, …).
Auto-stamp `created_by` from the session user.

**Steps:**
1. `AddTransaction` component with the three fields + chip row.
2. On submit: write to Dexie `transactions` (with a client-generated
   `client_id`, `created_by`, `spent_at`, `updated_at = now()`); append to
   Dexie `pending_changes` (`op: insert`).
3. For v1, also fire the Supabase insert directly if online (Phase 6 refactors
   this into the queue + retry).

**Validation:**
- Submit with empty amount ⇒ blocked.
- Transaction appears in Dexie (DevTools → Application → IndexedDB).
- `created_by` = current user.

---

### Phase 4 — Waterfall timeline + month date bar (#5)

**Scope:** The main view. Reads from Dexie; live-reacts to local writes.

**UI:**
- **Top date bar:** current month shown; tap to pick another month (defaults to
  current month).
- **Waterfall:** chronological list of that month's transactions; the monthly
  budget depletes as each spend lands; show remaining budget descending.
- Each entry shows who entered it (`created_by` → display name).

**Steps:**
1. Compute month bounds from the selected date-bar month; filter Dexie txns by
   `spent_at` within the month (exclude `deleted_at` rows).
2. Render entries newest-first (or chosen order) with running remaining = budget − Σ spent.
3. Date-bar component: month picker (prev/next + month grid).
4. Re-query on any Dexie change (Dexie `liveQuery`).

**Validation:**
- Add a transaction ⇒ it shows immediately in the waterfall; remaining updates.
- Navigate to last month ⇒ last month's txns + budget; back to current month.
- Deleted (soft) txns are hidden but recoverable via audit log.

---

### Phase 5 — Budget setting (#6)

**Scope:** Edit the monthly budget amount; carries forward.

**Steps:**
1. Budget settings screen: shows current amount; editable.
2. On save: update Dexie `budgets` row + queue an `update` in `pending_changes`.
3. The waterfall's "remaining" recomputes against the (possibly new) budget.

**Validation:**
- Change budget ⇒ waterfall remaining recalculates for the month.
- New month shows the carried-forward amount (no rollover of spend).
- Budget edits create an `audit_log` row.

---

### Phase 6 — Offline-first sync queue + realtime inbound (#7)

**Scope:** The sync engine: drain `pending_changes` to Supabase on reconnect;
subscribe to realtime for the partner's changes; last-write-wins.

**Steps:**
1. Sync engine: on `online` event + on interval, drain `pending_changes`:
   upsert/delete by `client_id` (idempotent); mark synced or bump attempts.
2. On failure: backoff retry; surface a "sync pending / failed" indicator.
3. Realtime: subscribe to `transactions` + `budgets` for the household; upsert/
   delete in Dexie; UI reacts live.
4. Last-write-wins: client sends `updated_at = now()` on every write; server /
   client compares incoming `updated_at` and keeps the latest.
5. Cold start: if Dexie empty, fetch the household's txns + budget from Supabase
   to rebuild the local cache.

**Validation:**
- Offline: add 3 txns (queued in `pending_changes`); go online ⇒ all 3 sync; queue empty.
- Two devices online: device A adds a txn ⇒ appears on device B within ~1–2s.
- Offline edit then reconnect: audit trail shows the original + the change;
  latest `updated_at` wins.

---

### Phase 7 — Edit/delete + audit trail (#8)

**Scope:** Edit and delete transactions (either partner, any txn); audit trail
records who/when/what. *Recording only* — the viewer UI is fast-follow.

**Steps:**
1. Tap a transaction ⇒ edit (amount/time/note/chip) or delete.
2. On edit: update Dexie row (`updated_at = now()`, `updated_by` = current
   user); queue `update` in `pending_changes`. The DB trigger writes `audit_log`.
3. On delete: soft-delete (`deleted_at`, `deleted_by`); queue `delete` (soft);
   audit log records the delete.
4. Either partner can edit/delete the other's entries (RLS allows household
   scope; audit trail is the accountability).

**Validation:**
- Edit a txn ⇒ waterfall recalculates; `audit_log` has old+new values + editor.
- Delete a txn ⇒ hidden from waterfall; `audit_log` records delete + deleter.
- Partner A edits txn B created ⇒ allowed; audit log shows A as `changed_by`.

---

## Compact Data-Model Reference

(Full detail in [`DESIGN.md`](./DESIGN.md) §4.)

- `households(id, name, invite_code, created_by, created_at)`
- `household_members(id, household_id, user_id, display_name, joined_at)` — ≤2
- `budgets(id, household_id UNIQUE, amount, updated_at, updated_by)`
- `transactions(id, household_id, amount, spent_at, note, chip, created_by,
   created_at, updated_at, updated_by, deleted_at, deleted_by, client_id UNIQUE)`
- `audit_log(id, household_id, table_name, record_id, action, old_values,
   new_values, changed_by, changed_at)` — INSERT-only

RLS: every tenant table scoped via `current_household_id()`; `audit_log`
append-only; `join_household(code)` is the one legit cross-household path.

---

## Sub-agent GitHub Workflow

When builder sub-agents implement these issues, they **must** follow proper git
hygiene. This keeps work trackable, reviewable, and isolated.

### Branching
- **One branch per issue.** Naming: `feat/issue-<N>-<slug>` (e.g.
  `feat/issue-2-supabase-schema-rls`). Use `fix/`, `chore/`, `docs/` prefixes
  when the work isn't a feature.
- Always branch from `main` (ensure `main` is up to date: `git fetch && git
  checkout main && git pull` before branching).

### Worktree isolation
- Each builder runs in its own **git worktree** so parallel tasks don't collide.
- With pi-subagents, set `worktree: true` on parallel tasks (requires clean git
  state). Manual equivalent:
  ```bash
  git worktree add ../couple-spending-issue-2 feat/issue-2-supabase-schema-rls
  cd ../couple-spending-issue-2
  ```
- **One writer per worktree/branch.** Never run two writers against the same
  branch — use fresh-context read-only reviewers for validation, then the parent
  synthesizes/applies fixes.

### Commits
- Use **Conventional Commits**, referencing the issue number:
  - `feat: add transactions table + RLS policies (#2)`
  - `fix: correct last-write-wins comparison on budget (#6)`
  - `chore: scaffold vite + pwa plugin (#1)`
- Keep commits small and focused; one logical change per commit.
- Reference the issue in the PR body (GitHub auto-links `Closes #N`).

### Push & Pull Request
- Push the branch: `git push -u origin feat/issue-<N>-<slug>`.
- Open a PR against `main`: `gh pr create --base main --title "feat: <summary>
  (#N)" --body "Closes #N"`.
- PR body should include: what changed, how to test, validation checks run.
- Request review; merge via squash merge into `main` after approval.
- Delete the branch + worktree after merge: `git worktree remove ... && git
  branch -d ...` and delete the remote branch.

### Issue tracking
- Each phase above is a GitHub issue with acceptance criteria (created
  separately). A builder claims an issue, moves it to "In Progress", and the PR
  `Closes #N` on merge.

---

## Fast-Follow (post-v1, not issued yet)

- **Presence bubble** — Supabase Realtime broadcast/presence; live "partner is
  adding a transaction" indicator.
- **Audit-trail viewer UI** — browse the `audit_log` for any transaction/month.
- **Insights / analytics** — monthly trends, chip breakdown, spend-by-who.
- **Custom quick-input chips**, **audit-log retention/purge policy**, **passkey
  login**, **conflict-noticed affordance** on clobbered local edits.
