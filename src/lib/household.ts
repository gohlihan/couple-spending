import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Invite codes — 8-char, unambiguous alphabet (no 0/O/I/1) so they're safe to
// read aloud or type. Generated with the Web Crypto CSPRNG.
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

export function generateInviteCode(length = CODE_LENGTH): string {
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[values[i] % CODE_ALPHABET.length]
  }
  return code
}

/** Normalise a user-typed invite code (trim + uppercase). */
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase()
}

export interface CreatedHousehold {
  householdId: string
  inviteCode: string
}

/**
 * First-user signup path: create the household, the creator's membership, and a
 * default budget (amount 0; editable in Phase 5).
 *
 * Insert order matters because of RLS:
 *   1. households    — bootstrap INSERT policy allows created_by = auth.uid()
 *   2. household_members — bootstrap INSERT policy allows user_id = auth.uid();
 *      once this row exists, current_household_id() resolves for the user
 *   3. budgets       — INSERT `with check` requires household_id matches
 *      current_household_id(), which only resolves after step 2
 *
 * The invite code is regenerated on a unique-constraint collision (vanishingly
 * rare for 8 chars from a 32-char alphabet) before giving up.
 */
export async function createHouseholdForUser(
  userId: string,
  displayName: string,
): Promise<CreatedHousehold> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt++) {
    const inviteCode = generateInviteCode()

    const { data: household, error } = await supabase
      .from('households')
      .insert({ created_by: userId, invite_code: inviteCode })
      .select('id, invite_code')
      .single()

    if (error) {
      lastError = error
      // 23505 = unique_violation (invite_code collision) → retry with a new code
      if (error.code === '23505') continue
      throw error
    }

    const { error: memberError } = await supabase.from('household_members').insert({
      household_id: household.id,
      user_id: userId,
      display_name: displayName.trim() || null,
    })
    if (memberError) throw memberError

    const { error: budgetError } = await supabase.from('budgets').insert({
      household_id: household.id,
      amount: 0,
      updated_by: userId,
    })
    if (budgetError) throw budgetError

    return { householdId: household.id, inviteCode: household.invite_code }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to create household: invite code collision')
}

/**
 * Second-user join path: call the `join_household(p_invite_code)` security
 * definer RPC (the one legit cross-household write), then set the joining
 * user's display name (the RPC inserts the membership row without it).
 *
 * Returns the household id the user joined.
 */
export async function joinHouseholdByCode(
  userId: string,
  inviteCode: string,
  displayName: string,
): Promise<string> {
  const code = normalizeInviteCode(inviteCode)

  const { data, error } = await supabase.rpc('join_household', {
    p_invite_code: code,
  })
  if (error) throw error

  const householdId = data as string

  const { error: updateError } = await supabase
    .from('household_members')
    .update({ display_name: displayName.trim() || null })
    .eq('user_id', userId)
  if (updateError) throw updateError

  return householdId
}
