-- ============================================================================
-- 0003_realtime_publication.sql — publish sync tables to Supabase Realtime
-- ============================================================================
-- Issue #7 — Phase 6: inbound transaction and budget changes.
--
-- Realtime is configured in a migration rather than only through the Studio
-- dashboard. The publication exists in every managed Supabase project; the
-- catalog checks make this safe to apply again in local/staging environments.
-- REPLICA IDENTITY FULL requests old-row values for UPDATE/DELETE events, but
-- Supabase documents that RLS-protected DELETE payloads may still contain only
-- primary key(s). The client therefore uses an unfiltered DELETE subscription
-- and an authenticated SELECT fallback before applying an incomplete delete.
-- ============================================================================

alter table public.transactions replica identity full;
alter table public.budgets replica identity full;

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
