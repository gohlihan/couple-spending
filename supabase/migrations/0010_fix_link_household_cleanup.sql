-- ============================================================================
-- 0010_fix_link_household_cleanup.sql — fix empty-household cleanup ordering
-- ============================================================================
-- 0009 deleted audit rows before deleting the default budget. The budget audit
-- trigger then recreated an audit row, preventing the household from being
-- deleted by its foreign key. Delete the budget first, then its audit rows.

CREATE OR REPLACE FUNCTION public.link_household_by_code(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_household_id uuid;
  v_target_household_id uuid;
  v_current_creator uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to link a household';
  END IF;

  SELECT household_id
  INTO v_current_household_id
  FROM public.household_members
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_current_household_id IS NULL THEN
    RAISE EXCEPTION 'You must finish account setup before linking a household';
  END IF;

  SELECT id
  INTO v_target_household_id
  FROM public.households
  WHERE invite_code = upper(trim(p_invite_code))
  FOR UPDATE;

  IF v_target_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or unknown invite code';
  END IF;

  IF v_current_household_id = v_target_household_id THEN
    RETURN v_current_household_id;
  END IF;

  IF (
    SELECT count(*)
    FROM public.household_members
    WHERE household_id = v_target_household_id
  ) >= 2 THEN
    RAISE EXCEPTION 'Partner household already has the maximum of 2 members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE household_id = v_current_household_id
      AND user_id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'Your current household already has another member';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE household_id = v_current_household_id
  ) OR EXISTS (
    SELECT 1
    FROM public.planned_items
    WHERE household_id = v_current_household_id
  ) THEN
    RAISE EXCEPTION 'You can only link an empty household without spending or plans';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.budgets
    WHERE household_id = v_current_household_id
      AND amount <> 0
  ) THEN
    RAISE EXCEPTION 'Reset your current budget to RM 0.00 before linking';
  END IF;

  SELECT created_by
  INTO v_current_creator
  FROM public.households
  WHERE id = v_current_household_id;

  DELETE FROM public.household_members
  WHERE user_id = v_user_id
    AND household_id = v_current_household_id;

  INSERT INTO public.household_members (household_id, user_id)
  VALUES (v_target_household_id, v_user_id);

  IF v_current_creator = v_user_id THEN
    DELETE FROM public.budgets
    WHERE household_id = v_current_household_id;
    DELETE FROM public.audit_log
    WHERE household_id = v_current_household_id;
    DELETE FROM public.households
    WHERE id = v_current_household_id;
  END IF;

  RETURN v_target_household_id;
END;
$$;
