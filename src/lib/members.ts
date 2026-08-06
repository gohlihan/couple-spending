import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Map of `user_id` → display name for a household's members. */
export type MemberNames = Record<string, string>;

export interface HouseholdMemberOption {
  userId: string;
  displayName: string | null;
}

// Module-level cache so the member roster is fetched at most once per household
// per session (it changes rarely — a household is capped at two members).
const rosterCache = new Map<string, HouseholdMemberOption[]>();

/** Shorten a user id for a readable fallback when no display name is set. */
export function shortId(userId: string): string {
  return userId.slice(0, 8);
}

/**
 * Resolve household member display names, fetched once from Supabase and
 * cached. Falls back to a short id in the consumer when a name is missing.
 */
export function useHouseholdMemberRoster(householdId: string | null): HouseholdMemberOption[] {
  const [members, setMembers] = useState<HouseholdMemberOption[]>(() =>
    householdId ? (rosterCache.get(householdId) ?? []) : [],
  );

  useEffect(() => {
    if (!householdId) {
      setMembers([]);
      return;
    }

    const cached = rosterCache.get(householdId);
    if (cached) {
      setMembers(cached);
      return;
    }
    setMembers([]);

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('household_members')
          .select('user_id, display_name')
          .eq('household_id', householdId);
        if (error || !data) return;
        const roster: HouseholdMemberOption[] = [];
        for (const row of data) {
          if (row.user_id) {
            roster.push({ userId: row.user_id, displayName: row.display_name ?? null });
          }
        }
        rosterCache.set(householdId, roster);
        if (active) setMembers(roster);
      } catch (error: unknown) {
        console.warn('Could not load household members.', error);
      }
    })();

    return () => {
      active = false;
    };
  }, [householdId]);

  return members;
}

export function useHouseholdMembers(householdId: string | null): MemberNames {
  const members = useHouseholdMemberRoster(householdId);
  const names: MemberNames = {};
  for (const member of members) {
    if (member.displayName) names[member.userId] = member.displayName;
  }
  return names;
}
