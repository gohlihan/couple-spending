-- ============================================================================
-- 0006_bootstrap_household_returning.sql — allow creator bootstrap RETURNING
-- ============================================================================
-- The first-user flow inserts a household with `.select('id, invite_code')`
-- before its membership row exists. The original household SELECT policy only
-- allowed current members, so PostgREST's INSERT ... RETURNING could not see the
-- newly-created row even though the INSERT WITH CHECK passed. Let the creator
-- read their own bootstrap row; normal household reads remain membership-scoped.
-- ============================================================================

drop policy if exists "households: select own" on public.households;
create policy "households: select own"
  on public.households for select
  using (
    id = public.current_household_id()
    or created_by = auth.uid()
  );

-- ============================================================================
-- End of 0006_bootstrap_household_returning.sql
-- ============================================================================
