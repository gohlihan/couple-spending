-- ============================================================================
-- 0012_planning_events.sql — shared event planning on the plan screen
-- ============================================================================
-- Events group planned items (hotel, flights, ...) under one named trip or
-- project. They follow the same household RLS, LWW versioning, durable client
-- ids, and Realtime publication as planned items. Items reference their event
-- through a plain nullable uuid so deleting an event can never orphan a
-- completed item at the database level; clients detach items before delete.
-- ============================================================================

create table if not exists public.planning_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  starts_on     date,
  ends_on       date,
  note          text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  client_id     text unique,
  constraint planning_events_date_order
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists idx_planning_events_household_start
  on public.planning_events (household_id, starts_on, created_at);

alter table public.planning_events enable row level security;

drop policy if exists "planning_events: household-scoped" on public.planning_events;
drop policy if exists "planning_events: select own" on public.planning_events;
drop policy if exists "planning_events: insert own" on public.planning_events;
drop policy if exists "planning_events: update own" on public.planning_events;
drop policy if exists "planning_events: delete own" on public.planning_events;
create policy "planning_events: select own"
  on public.planning_events for select
  using (household_id = public.current_household_id());
create policy "planning_events: insert own"
  on public.planning_events for insert
  with check (household_id = public.current_household_id());
create policy "planning_events: update own"
  on public.planning_events for update
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());
create policy "planning_events: delete own"
  on public.planning_events for delete
  using (household_id = public.current_household_id());

-- Author and editor stamps are derived server-side, mirroring planned_items.
create or replace function public.stamp_planning_event_actors()
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
    NEW.created_by = v_actor;
    NEW.updated_by = v_actor;
  else
    NEW.created_by = OLD.created_by;
    NEW.created_at = OLD.created_at;
    NEW.updated_by = v_actor;
  end if;

  return NEW;
end;
$$;

drop trigger if exists a_stamp_planning_event_actors on public.planning_events;
create trigger a_stamp_planning_event_actors
  before insert or update on public.planning_events
  for each row execute function public.stamp_planning_event_actors();

drop trigger if exists bump_planning_events_updated_at on public.planning_events;
create trigger bump_planning_events_updated_at
  before update on public.planning_events
  for each row execute function public.bump_updated_at();

drop trigger if exists audit_planning_events on public.planning_events;
create trigger audit_planning_events
  after insert or update or delete on public.planning_events
  for each row execute function public.write_audit_log();

alter table public.planned_items
  add column if not exists event_id uuid references public.planning_events (id)
  on delete set null;

create index if not exists idx_planned_items_event
  on public.planned_items (event_id) where event_id is not null;

alter table public.planning_events replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planning_events'
  ) then
    execute 'alter publication supabase_realtime add table public.planning_events';
  end if;
end;
$$;

-- ============================================================================
-- End of 0012_planning_events.sql
-- ============================================================================
