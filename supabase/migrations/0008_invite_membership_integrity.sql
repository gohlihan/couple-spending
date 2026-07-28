-- ============================================================================
-- 0008_invite_membership_integrity.sql — one household per user
-- ============================================================================
-- Registration now accepts a typed invite code. Enforce the invariant at the
-- database boundary so retries and concurrent joins cannot split one user
-- across multiple households.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.household_members
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add one-household membership constraint: duplicate user memberships exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS household_members_one_household_per_user
  ON public.household_members (user_id);

CREATE OR REPLACE FUNCTION public.join_household(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_household_id uuid;
  v_existing_household_id uuid;
  v_joined_household_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to join a household';
  END IF;

  SELECT household_id
  INTO v_existing_household_id
  FROM public.household_members
  WHERE user_id = auth.uid();

  SELECT id
  INTO v_target_household_id
  FROM public.households
  WHERE invite_code = upper(trim(p_invite_code))
  FOR UPDATE;

  IF v_target_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or unknown invite code';
  END IF;

  IF v_existing_household_id IS NOT NULL
     AND v_existing_household_id <> v_target_household_id THEN
    RAISE EXCEPTION 'You already belong to another household';
  END IF;

  -- The unique index serializes concurrent attempts for the same user. A
  -- same-household retry is intentionally idempotent.
  INSERT INTO public.household_members (household_id, user_id)
  VALUES (v_target_household_id, auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT household_id
  INTO v_joined_household_id
  FROM public.household_members
  WHERE user_id = auth.uid();

  IF v_joined_household_id <> v_target_household_id THEN
    RAISE EXCEPTION 'You already belong to another household';
  END IF;

  IF (
    SELECT count(*)
    FROM public.household_members
    WHERE household_id = v_target_household_id
  ) > 2 THEN
    RAISE EXCEPTION 'Household already has the maximum of 2 members';
  END IF;

  RETURN v_joined_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_household(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_household(text) TO authenticated;

-- Keep the migration ledger explicit for environments that apply SQL manually.
-- ============================================================================
