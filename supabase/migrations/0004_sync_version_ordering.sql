-- ============================================================================
-- 0004_sync_version_ordering.sql — preserve client LWW versions
-- ============================================================================
-- Issue #7 — Phase 6 follow-up.
--
-- This is a forward migration because an earlier 0003 may already have been
-- applied. It keeps the client-provided updated_at as the conflict key and
-- uses updated_by to order otherwise identical timestamps. A stale UPDATE is
-- skipped before the audit trigger runs; retries remain safe and idempotent.
-- ============================================================================

create or replace function public.bump_updated_at()
returns trigger
language plpgsql
as $$
declare
  new_writer text := coalesce(NEW.updated_by::text, '');
  old_writer text := coalesce(OLD.updated_by::text, '');
begin
  if TG_OP = 'UPDATE' then
    if NEW.updated_at is null then
      NEW.updated_at = now();
    elsif NEW.updated_at < OLD.updated_at
      or (NEW.updated_at = OLD.updated_at and new_writer <= old_writer) then
      return null;
    end if;
  end if;
  return NEW;
end;
$$;
