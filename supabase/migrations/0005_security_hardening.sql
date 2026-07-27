-- ============================================================================
-- 0005_security_hardening.sql — tighten membership, audit, and actor writes
-- ============================================================================
-- Issue #7 follow-up. The original bootstrap policies were intentionally small
-- for Phase 1, but direct authenticated clients must not be able to join an
-- arbitrary household UUID, rewrite another member, forge audit rows, or
-- spoof transaction/budget actor columns. The security-definer audit trigger
-- remains the only client-visible write path for audit_log.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bootstrap membership is only allowed for the creator's own new household.
--    The invite-code RPC remains the only cross-household join path.
-- ---------------------------------------------------------------------------
create or replace function public.can_bootstrap_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = p_household_id
      and h.created_by = auth.uid()
  )
  and not exists (
    select 1
    from public.household_members m
    where m.user_id = auth.uid()
  );
$$;

drop policy if exists "members: insert self" on public.household_members;
create policy "members: insert self"
  on public.household_members for insert
  with check (
    user_id = auth.uid()
    and public.can_bootstrap_household_member(household_id)
  );

-- A member may edit only their own display name. Membership identity and
-- household ownership are not client-editable, and there is no client DELETE
-- policy because leaving/removing a household is not a v1 operation.
drop policy if exists "members: update own" on public.household_members;
create policy "members: update own"
  on public.household_members for update
  using (
    household_id = public.current_household_id()
    and user_id = auth.uid()
  )
  with check (
    household_id = public.current_household_id()
    and user_id = auth.uid()
  );
drop policy if exists "members: delete own" on public.household_members;

-- ---------------------------------------------------------------------------
-- 2. Serialize member-count checks by locking the household parent row.
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
        perform 1
        from public.households
        where id = NEW.household_id
        for update;
    elsif NEW.household_id is distinct from OLD.household_id then
        perform 1
        from public.households
        where id = NEW.household_id
        for update;
    else
        return NEW;
    end if;

    select count(*) into v_count
    from public.household_members
    where household_id = NEW.household_id;
    if v_count >= 2 then
        raise exception 'Household % already has the maximum of 2 members',
            NEW.household_id;
    end if;
    return NEW;
end;
$$;

-- Lock before counting in the security-definer invite path as well. The
-- trigger takes the same parent-row lock reentrantly in this transaction.
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
    select h.id into v_household_id
    from public.households h
    where h.invite_code = p_invite_code
    for update;

    if v_household_id is null then
        raise exception 'Invalid or unknown invite code';
    end if;

    select count(*) into v_member_count
    from public.household_members
    where household_id = v_household_id;

    if v_member_count >= 2 then
        raise exception 'Household already has the maximum of 2 members';
    end if;

    insert into public.household_members (household_id, user_id)
    values (v_household_id, auth.uid())
    on conflict (household_id, user_id) do nothing;

    return v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Actor fields are server-derived for authenticated writes. updated_at is
--    intentionally client-provided for offline LWW; the audit trigger's
--    changed_by remains the authoritative actor record.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_transaction_actors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Keep trusted service-role/admin maintenance possible while preventing an
  -- authenticated client from claiming another user's identity.
  if v_actor is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    NEW.created_by = v_actor;
    NEW.updated_by = v_actor;
  else
    NEW.created_by = OLD.created_by;
    NEW.created_at = OLD.created_at;
    NEW.updated_by = v_actor;
  end if;

  if NEW.deleted_at is null then
    NEW.deleted_by = null;
  elsif TG_OP = 'INSERT' or NEW.deleted_at is distinct from OLD.deleted_at then
    NEW.deleted_by = v_actor;
  else
    NEW.deleted_by = OLD.deleted_by;
  end if;

  return NEW;
end;
$$;

drop trigger if exists a_stamp_transactions_actors on public.transactions;
create trigger a_stamp_transactions_actors
  before insert or update on public.transactions
  for each row execute function public.stamp_transaction_actors();

create or replace function public.stamp_budget_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    NEW.updated_by = auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists a_stamp_budget_actor on public.budgets;
create trigger a_stamp_budget_actor
  before insert or update on public.budgets
  for each row execute function public.stamp_budget_actor();

-- ---------------------------------------------------------------------------
-- 4. Audit rows are written by the security-definer trigger only. Authenticated
--    clients retain SELECT access but cannot forge INSERT/UPDATE/DELETE rows.
-- ---------------------------------------------------------------------------
drop policy if exists "audit_log: insert own" on public.audit_log;
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ==========================================================================
-- End of 0005_security_hardening.sql
-- ==========================================================================
