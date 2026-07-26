-- ============================================================================
-- 0001_init.sql — Couple Spending: initial schema, RLS, and audit triggers
-- ============================================================================
-- Issue #2 — Phase 1: Supabase schema + RLS + audit-log trigger.
--
-- This migration creates all five tenant tables, the household-scoped RLS
-- helper, the invite-code join function, the ≤2-members cap trigger, the
-- updated_at auto-bump triggers, and the audit-log triggers for transactions
-- and budgets.
--
-- The file is idempotent: every object uses IF NOT EXISTS / OR REPLACE /
-- drop-if-exists so re-running it is a safe no-op.
--
-- NOTE: `auth.users` and `auth.uid()` are provided by Supabase Auth and will
-- exist in any Supabase project. They are referenced here as-is.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 households — one per couple; created by the first user who signs up.
-- ---------------------------------------------------------------------------
create table if not exists public.households (
    id           uuid primary key default gen_random_uuid(),
    name         text,
    invite_code  text unique not null,
    created_by   uuid references auth.users (id),
    created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1.2 household_members — links auth users to a household (max 2 per household).
--     The ≤ 2 cap is enforced by the enforce_household_member_cap trigger
--     (see section 3) rather than a static CHECK, because a CHECK cannot count
--     across rows.
-- ---------------------------------------------------------------------------
create table if not exists public.household_members (
    id           uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households (id) on delete cascade,
    user_id      uuid not null references auth.users (id) on delete cascade,
    display_name text,
    joined_at    timestamptz not null default now(),
    unique (household_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 1.3 budgets — exactly one current budget per household (unique household_id).
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
    id           uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households (id) unique,
    amount       numeric(12,2) not null,
    updated_at   timestamptz not null default now(),
    updated_by   uuid references auth.users (id)
);

-- ---------------------------------------------------------------------------
-- 1.4 transactions — every spend in the shared pool; soft-deletable.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
    id           uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households (id),
    amount       numeric(12,2) not null,
    spent_at     timestamptz not null default now(),
    note         text,
    chip         text,
    created_by   uuid references auth.users (id),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    updated_by   uuid references auth.users (id),
    deleted_at   timestamptz,
    deleted_by   uuid references auth.users (id),
    client_id    text unique
);

-- ---------------------------------------------------------------------------
-- 1.5 audit_log — immutable history of inserts/updates/deletes.
--     RLS makes it INSERT-only (no UPDATE/DELETE policies).
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
    id           uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households (id),
    table_name   text not null,
    record_id    uuid,
    action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
    old_values   jsonb,
    new_values   jsonb,
    changed_by   uuid references auth.users (id),
    changed_at   timestamptz not null default now()
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================

-- Waterfall + month-filter lookup: household's transactions newest-first.
create index if not exists idx_transactions_household_spent_at
    on public.transactions (household_id, spent_at desc);

-- Audit history lookup: all changes for a given record in time order.
create index if not exists idx_audit_log_household_record_changed
    on public.audit_log (household_id, record_id, changed_at);

-- ============================================================================
-- 3. Functions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 current_household_id() — the caller's household.
--      Security definer so it can read household_members even before the caller
--      has any explicit SELECT grant on that table (used inside RLS policies).
-- ---------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select household_id
    from public.household_members
    where user_id = auth.uid()
    limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3.2 join_household(p_invite_code) — the ONE legit cross-household path.
--      Security definer (bypasses RLS) so the 2nd user can insert a
--      household_members row for a household they don't yet belong to.
--      Validates the invite code, enforces the ≤2 cap, inserts the membership,
--      and returns the household id. Re-joining an existing membership is a
--      safe no-op (on conflict do nothing).
-- ---------------------------------------------------------------------------
create or replace function public.join_household(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_household_id uuid;
    v_member_count int;
begin
    -- Look up the household by invite code. The parameter is prefixed p_
    -- and the column is schema-qualified so the PL/pgSQL parameter does not
    -- shadow the households.invite_code column (avoids "column reference
    -- 'invite_code' is ambiguous").
    select id into v_household_id
    from public.households
    where public.households.invite_code = p_invite_code;

    if v_household_id is null then
        raise exception 'Invalid or unknown invite code';
    end if;

    -- Count existing members; reject if the household is already full.
    select count(*) into v_member_count
    from public.household_members
    where household_id = v_household_id;

    if v_member_count >= 2 then
        raise exception 'Household already has the maximum of 2 members';
    end if;

    -- Insert the calling user's membership (idempotent on re-join).
    insert into public.household_members (household_id, user_id)
    values (v_household_id, auth.uid())
    on conflict (household_id, user_id) do nothing;

    return v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.3 enforce_household_member_cap() — trigger fn for the ≤2-members rule.
--      BEFORE INSERT OR UPDATE on household_members. On INSERT, raises if the
--      target household already has 2 members. On UPDATE that moves a member
--      to a different household, raises if the new household is already full.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_household_member_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    if TG_OP = 'INSERT' then
        select count(*) into v_count
        from public.household_members
        where household_id = NEW.household_id;
        if v_count >= 2 then
            raise exception 'Household % already has the maximum of 2 members',
                NEW.household_id;
        end if;
    elsif TG_OP = 'UPDATE' then
        -- Only matters if the member is being moved to a different household.
        if NEW.household_id is distinct from OLD.household_id then
            select count(*) into v_count
            from public.household_members
            where household_id = NEW.household_id;
            if v_count >= 2 then
                raise exception 'Household % already has the maximum of 2 members',
                    NEW.household_id;
            end if;
        end if;
    end if;
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.4 bump_updated_at() — trigger fn that refreshes updated_at on UPDATE.
--      Shared by transactions and budgets (two triggers, one function).
-- ---------------------------------------------------------------------------
create or replace function public.bump_updated_at()
returns trigger
language plpgsql
as $$
begin
    NEW.updated_at = now();
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.5 write_audit_log() — trigger fn that records every change to
--      transactions and budgets into audit_log. Security definer so the audit
--      trail is written reliably (the audit log is the financial safety net
--      and must never fail silently). old_values is set for UPDATE/DELETE;
--      new_values is set for INSERT/UPDATE; changed_by = auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if TG_OP = 'INSERT' then
        insert into public.audit_log
            (household_id, table_name, record_id, action, old_values, new_values, changed_by)
        values
            (NEW.household_id, TG_TABLE_NAME, NEW.id, TG_OP, null, to_jsonb(NEW), auth.uid());
        return NEW;
    elsif TG_OP = 'UPDATE' then
        insert into public.audit_log
            (household_id, table_name, record_id, action, old_values, new_values, changed_by)
        values
            (NEW.household_id, TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
        return NEW;
    elsif TG_OP = 'DELETE' then
        insert into public.audit_log
            (household_id, table_name, record_id, action, old_values, new_values, changed_by)
        values
            (OLD.household_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), null, auth.uid());
        return OLD;
    end if;
    return null;
end;
$$;

-- ============================================================================
-- 4. Triggers
-- ============================================================================

-- 4.1 Membership cap (before insert or update).
drop trigger if exists enforce_household_member_cap on public.household_members;
create trigger enforce_household_member_cap
    before insert or update on public.household_members
    for each row execute function public.enforce_household_member_cap();

-- 4.2 updated_at auto-bump on transactions.
drop trigger if exists bump_transactions_updated_at on public.transactions;
create trigger bump_transactions_updated_at
    before update on public.transactions
    for each row execute function public.bump_updated_at();

-- 4.3 updated_at auto-bump on budgets.
drop trigger if exists bump_budgets_updated_at on public.budgets;
create trigger bump_budgets_updated_at
    before update on public.budgets
    for each row execute function public.bump_updated_at();

-- 4.4 Audit trigger on transactions (after insert / update / delete).
drop trigger if exists audit_transactions on public.transactions;
create trigger audit_transactions
    after insert or update or delete on public.transactions
    for each row execute function public.write_audit_log();

-- 4.5 Audit trigger on budgets (after insert / update / delete).
drop trigger if exists audit_budgets on public.budgets;
create trigger audit_budgets
    after insert or update or delete on public.budgets
    for each row execute function public.write_audit_log();

-- ============================================================================
-- 5. Row Level Security
-- ============================================================================

-- Enable RLS on all five tenant tables.
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.budgets           enable row level security;
alter table public.transactions      enable row level security;
alter table public.audit_log         enable row level security;

-- ---------------------------------------------------------------------------
-- 5.1 households
--   SELECT — only your own household.
--   INSERT — bootstrap: the creator can insert their first household before
--            they have any membership row (created_by = auth.uid()). After
--            that, join_household() (security definer) adds the 2nd member.
--   UPDATE — only your own household.
--   (No DELETE policy ⇒ deletes are blocked, which is intended.)
-- ---------------------------------------------------------------------------
drop policy if exists "households: select own"       on public.households;
drop policy if exists "households: insert bootstrap"  on public.households;
drop policy if exists "households: update own"        on public.households;

create policy "households: select own"
    on public.households for select
    using (id = public.current_household_id());

create policy "households: insert bootstrap"
    on public.households for insert
    with check (created_by = auth.uid());

create policy "households: update own"
    on public.households for update
    using (id = public.current_household_id())
    with check (id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- 5.2 household_members
--   SELECT — only members of your own household.
--   INSERT — bootstrap: a user may insert their OWN first membership row
--            (user_id = auth.uid()). The 2nd member joins via the
--            join_household() security-definer function, which bypasses RLS.
--   UPDATE / DELETE — only within your own household.
-- ---------------------------------------------------------------------------
drop policy if exists "members: select own"    on public.household_members;
drop policy if exists "members: insert self"   on public.household_members;
drop policy if exists "members: update own"    on public.household_members;
drop policy if exists "members: delete own"    on public.household_members;

create policy "members: select own"
    on public.household_members for select
    using (household_id = public.current_household_id());

create policy "members: insert self"
    on public.household_members for insert
    with check (user_id = auth.uid());

create policy "members: update own"
    on public.household_members for update
    using (household_id = public.current_household_id())
    with check (household_id = public.current_household_id());

create policy "members: delete own"
    on public.household_members for delete
    using (household_id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- 5.3 budgets — full access within your own household.
-- ---------------------------------------------------------------------------
drop policy if exists "budgets: household-scoped" on public.budgets;

create policy "budgets: household-scoped"
    on public.budgets for all
    using (household_id = public.current_household_id())
    with check (household_id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- 5.4 transactions — full access within your own household.
-- ---------------------------------------------------------------------------
drop policy if exists "transactions: household-scoped" on public.transactions;

create policy "transactions: household-scoped"
    on public.transactions for all
    using (household_id = public.current_household_id())
    with check (household_id = public.current_household_id());

-- ---------------------------------------------------------------------------
-- 5.5 audit_log — SELECT your own household; INSERT only (no UPDATE/DELETE
--   policies at all), which guarantees the log is immutable. The audit triggers
--   write rows as a security-definer function; direct client INSERTs must still
--   satisfy the household check.
-- ---------------------------------------------------------------------------
drop policy if exists "audit_log: select own"   on public.audit_log;
drop policy if exists "audit_log: insert own"   on public.audit_log;

create policy "audit_log: select own"
    on public.audit_log for select
    using (household_id = public.current_household_id());

create policy "audit_log: insert own"
    on public.audit_log for insert
    with check (household_id = public.current_household_id());

-- ============================================================================
-- End of 0001_init.sql
-- ============================================================================
