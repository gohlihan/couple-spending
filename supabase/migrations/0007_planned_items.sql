-- ============================================================================
-- 0007_planned_items.sql — shared shopping plans with atomic completion
-- ============================================================================
-- Planned items use the same household RLS, LWW versioning, durable client IDs,
-- and Realtime publication as transactions. Completing an item must create one
-- spending record exactly once, even when a device retries after losing a
-- response or both partners press the checkbox at the same time.
-- ============================================================================

alter table public.transactions
  add column if not exists planned_item_id uuid unique;

create table if not exists public.planned_items (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  title                 text not null check (length(trim(title)) > 0),
  amount                numeric(12,2) not null check (amount > 0),
  planned_for           date,
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id),
  completed_at          timestamptz,
  completed_by          uuid references auth.users (id),
  spent_transaction_id  uuid unique,
  completion_client_id  text unique,
  client_id             text unique
);

create index if not exists idx_planned_items_household_active_date
  on public.planned_items (household_id, completed_at, planned_for, created_at);

alter table public.planned_items enable row level security;

drop policy if exists "planned_items: household-scoped" on public.planned_items;
drop policy if exists "planned_items: select own" on public.planned_items;
drop policy if exists "planned_items: insert own" on public.planned_items;
drop policy if exists "planned_items: update active" on public.planned_items;
drop policy if exists "planned_items: delete active" on public.planned_items;
create policy "planned_items: select own"
  on public.planned_items for select
  using (household_id = public.current_household_id());
create policy "planned_items: insert own"
  on public.planned_items for insert
  with check (household_id = public.current_household_id());
create policy "planned_items: update active"
  on public.planned_items for update
  using (household_id = public.current_household_id() and completed_at is null)
  with check (household_id = public.current_household_id());
create policy "planned_items: delete active"
  on public.planned_items for delete
  using (household_id = public.current_household_id() and completed_at is null);

-- Actor and completion stamps are derived server-side. Direct clients may add
-- and edit an active plan, but only complete_planned_item() may mark it done.
create or replace function public.stamp_planned_item_actors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.completed_at is not null
       and current_setting('app.plan_completion', true) is distinct from 'true' then
      raise exception 'Planned items must be completed through complete_planned_item()';
    end if;
    NEW.created_by = v_actor;
    NEW.updated_by = v_actor;
  else
    NEW.created_by = OLD.created_by;
    NEW.created_at = OLD.created_at;
    NEW.updated_by = v_actor;

    if NEW.completed_at is distinct from OLD.completed_at
       and current_setting('app.plan_completion', true) is distinct from 'true' then
      raise exception 'Planned items must be completed through complete_planned_item()';
    end if;

    if OLD.completed_at is not null and (
      NEW.title is distinct from OLD.title
      or NEW.amount is distinct from OLD.amount
      or NEW.planned_for is distinct from OLD.planned_for
      or NEW.completed_at is distinct from OLD.completed_at
      or NEW.spent_transaction_id is distinct from OLD.spent_transaction_id
      or NEW.completion_client_id is distinct from OLD.completion_client_id
    ) then
      raise exception 'Completed planned items are immutable';
    end if;
  end if;

  if NEW.completed_at is null then
    NEW.completed_by = null;
    NEW.spent_transaction_id = null;
    NEW.completion_client_id = null;
  elsif TG_OP = 'INSERT' or NEW.completed_at is distinct from OLD.completed_at then
    NEW.completed_by = v_actor;
  else
    NEW.completed_by = OLD.completed_by;
  end if;

  return NEW;
end;
$$;

drop trigger if exists a_stamp_planned_item_actors on public.planned_items;
create trigger a_stamp_planned_item_actors
  before insert or update on public.planned_items
  for each row execute function public.stamp_planned_item_actors();

drop trigger if exists bump_planned_items_updated_at on public.planned_items;
create trigger bump_planned_items_updated_at
  before update on public.planned_items
  for each row execute function public.bump_updated_at();

drop trigger if exists audit_planned_items on public.planned_items;
create trigger audit_planned_items
  after insert or update or delete on public.planned_items
  for each row execute function public.write_audit_log();

-- The lock serializes concurrent completion attempts. The completion id is
-- retained with the item and also used as the linked transaction client_id, so
-- retrying after a lost response returns the original canonical rows.
create or replace function public.complete_planned_item(
  p_planned_item_id uuid,
  p_completion_client_id text
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

  perform set_config('app.plan_completion', 'true', true);

  insert into public.transactions (
    id, household_id, amount, spent_at, note, chip,
    created_by, created_at, updated_at, updated_by,
    deleted_at, deleted_by, client_id, planned_item_id
  ) values (
    v_transaction_id, v_plan.household_id, v_plan.amount, now(), v_plan.title, 'shop',
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

revoke all on function public.complete_planned_item(uuid, text) from public;
grant execute on function public.complete_planned_item(uuid, text) to authenticated;

alter table public.planned_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planned_items'
  ) then
    execute 'alter publication supabase_realtime add table public.planned_items';
  end if;
end;
$$;

-- ============================================================================
-- End of 0007_planned_items.sql
-- ============================================================================
