-- ============================================================================
-- 0002_auto_stamp_defaults.sql — auto-stamp created_by / user_id / updated_by
-- ============================================================================
-- Issue #3 — Phase 2: Auth + invite-code household linking.
--
-- The bootstrap RLS policies (0001) require `created_by = auth.uid()`
-- (households) and `user_id = auth.uid()` (household_members), but a frontend
-- INSERT that omits those columns leaves them NULL, so the `with check`
-- policy fails with "new row violates row-level security policy".
--
-- These BEFORE INSERT triggers default the stamping column to auth.uid() when
-- the caller doesn't supply it, so the frontend bootstrap inserts (household,
-- membership, budget) succeed without explicitly passing the auth user id.
-- When the caller DOES supply a value, the trigger is a no-op (it only fills
-- NULLs), so security-definer RPCs like join_household() are unaffected.
-- ============================================================================

-- Auto-stamp created_by → auth.uid() when null.
create or replace function public.set_default_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;

-- Auto-stamp user_id → auth.uid() when null.
create or replace function public.set_default_user_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then new.user_id := auth.uid(); end if;
  return new;
end; $$;

-- Auto-stamp updated_by → auth.uid() when null.
create or replace function public.set_default_updated_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.updated_by is null then new.updated_by := auth.uid(); end if;
  return new;
end; $$;

-- households.created_by
drop trigger if exists set_households_created_by on public.households;
create trigger set_households_created_by before insert on public.households
  for each row execute function public.set_default_created_by();

-- household_members.user_id
drop trigger if exists set_household_members_user_id on public.household_members;
create trigger set_household_members_user_id before insert on public.household_members
  for each row execute function public.set_default_user_id();

-- budgets.updated_by
drop trigger if exists set_budgets_updated_by on public.budgets;
create trigger set_budgets_updated_by before insert on public.budgets
  for each row execute function public.set_default_updated_by();
