-- ============================================================================
-- 0011_transaction_payer.sql — separate payer attribution from entry actor
-- ============================================================================
-- A transaction may be entered by one partner on behalf of the other. The
-- existing created_by column remains the authenticated user who entered or
-- edited the row; payer_id records who actually paid.
-- ============================================================================

alter table public.transactions
  add column if not exists payer_id uuid;

-- Historical rows normally have a creator who is still a household member.
-- Leave exceptional rows nullable rather than failing a deployment because a
-- removed membership can no longer satisfy the household-scoped foreign key.
-- The LWW trigger rejects an UPDATE with an unchanged version, so suspend only
-- that version guard while backfilling this metadata field. Audit remains on.
alter table public.transactions disable trigger bump_transactions_updated_at;

update public.transactions as t
set payer_id = t.created_by
where t.payer_id is null
  and t.created_by is not null
  and exists (
    select 1
    from public.household_members as m
    where m.household_id = t.household_id
      and m.user_id = t.created_by
  );

alter table public.transactions enable trigger bump_transactions_updated_at;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_payer_household_member_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_payer_household_member_fkey
      foreign key (household_id, payer_id)
      references public.household_members (household_id, user_id);
  end if;
end;
$$;

-- Keep actor stamping authoritative while defaulting omitted payer values for
-- new writes and older offline clients. An explicit payer is preserved and is
-- checked by the composite foreign key above.
create or replace function public.stamp_transaction_actors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    NEW.payer_id = coalesce(NEW.payer_id, NEW.created_by);
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

  NEW.payer_id = coalesce(NEW.payer_id, v_actor, NEW.created_by);

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

-- New clients pass the payer explicitly. The two-argument wrapper keeps older
-- PWA clients and queued completion changes working with actor-as-payer.
create or replace function public.complete_planned_item(
  p_planned_item_id uuid,
  p_completion_client_id text,
  p_payer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.planned_items%rowtype;
  v_transaction public.transactions%rowtype;
  v_transaction_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_payer_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication is required';
  end if;
  if p_completion_client_id is null or length(trim(p_completion_client_id)) = 0 then
    raise exception 'A completion client id is required';
  end if;

  select * into v_plan
  from public.planned_items
  where id = p_planned_item_id
    and household_id = public.current_household_id()
  for update;

  if v_plan.id is null then
    raise exception 'Planned item was not found';
  end if;

  if v_plan.completed_at is not null then
    select * into v_transaction
    from public.transactions
    where id = v_plan.spent_transaction_id;
    return jsonb_build_object(
      'planned_item', to_jsonb(v_plan),
      'transaction', to_jsonb(v_transaction)
    );
  end if;

  v_payer_id := coalesce(p_payer_id, v_actor);
  if not exists (
    select 1
    from public.household_members
    where household_id = v_plan.household_id
      and user_id = v_payer_id
  ) then
    raise exception 'Payer must be a member of the household';
  end if;

  perform set_config('app.plan_completion', 'true', true);

  insert into public.transactions (
    id, household_id, amount, spent_at, note, chip, payer_id,
    created_by, created_at, updated_at, updated_by,
    deleted_at, deleted_by, client_id, planned_item_id
  ) values (
    v_transaction_id, v_plan.household_id, v_plan.amount, now(), v_plan.title, 'shop', v_payer_id,
    v_actor, now(), now(), v_actor,
    null, null, p_completion_client_id || ':transaction', v_plan.id
  )
  returning * into v_transaction;

  update public.planned_items
  set completed_at = now(),
      spent_transaction_id = v_transaction.id,
      completion_client_id = p_completion_client_id,
      updated_at = greatest(clock_timestamp(), v_plan.updated_at + interval '1 microsecond')
  where id = v_plan.id
  returning * into v_plan;

  return jsonb_build_object(
    'planned_item', to_jsonb(v_plan),
    'transaction', to_jsonb(v_transaction)
  );
end;
$$;

create or replace function public.complete_planned_item(
  p_planned_item_id uuid,
  p_completion_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.complete_planned_item(
    p_planned_item_id,
    p_completion_client_id,
    auth.uid()
  );
end;
$$;

revoke all on function public.complete_planned_item(uuid, text, uuid) from public;
grant execute on function public.complete_planned_item(uuid, text, uuid) to authenticated;
revoke all on function public.complete_planned_item(uuid, text) from public;
grant execute on function public.complete_planned_item(uuid, text) to authenticated;
