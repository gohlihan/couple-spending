-- ============================================================================
-- 0003_realtime_publication.sql — publish sync tables to Supabase Realtime
-- ============================================================================
-- Issue #7 — Phase 6: inbound transaction and budget changes.
--
-- Realtime is configured in a migration rather than only through the Studio
-- dashboard. The publication exists in every managed Supabase project; the
-- catalog checks make this safe to apply again in local/staging environments.
-- FULL replica identity is required so filtered DELETE events include the old
-- household_id and updated_at values used by the client LWW merge.
-- ============================================================================

alter table public.transactions replica identity full;
alter table public.budgets replica identity full;

-- Keep the client-provided updated_at as the conflict key. The original
-- trigger used server now() for every UPDATE, which made a later-synced older
-- offline edit look newer than an earlier-synced edit. A stale UPDATE is
-- skipped before the audit trigger runs; retries remain safe and idempotent.
create or replace function public.bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.updated_at is null then
      NEW.updated_at = now();
    elsif NEW.updated_at < OLD.updated_at then
      return null;
    end if;
  end if;
  return NEW;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.transactions';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'budgets'
  ) then
    execute 'alter publication supabase_realtime add table public.budgets';
  end if;
end;
$$;
