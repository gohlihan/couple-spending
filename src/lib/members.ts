import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Map of `user_id` → display name for a household's members. */
export type MemberNames = Record<string, string>;

// Module-level cache so the member roster is fetched at most once per household
// per session (it changes rarely — a household is capped at two members).
const cache = new Map<string, MemberNames>();

/** Shorten a user id for a readable fallback when no display name is set. */
export function shortId(userId: string): string {
  return userId.slice(0, 8);
}

/**
 * Resolve household member display names, fetched once from Supabase and
 * cached. Falls back to a short id in the consumer when a name is missing.
 */
export function useHouseholdMembers(householdId: string | null): MemberNames {
  const [names, setNames] = useState<MemberNames>(() =>
    householdId ? (cache.get(householdId) ?? {}) : {},
  );

  useEffect(() => {
    if (!householdId) {
      setNames({});
      return;
    }

    const cached = cache.get(householdId);
    if (cached) {
      setNames(cached);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('household_members')
          .select('user_id, display_name')
          .eq('household_id', householdId);
        if (error || !data) return;
        const map: MemberNames = {};
        for (const row of data) {
          if (row.display_name) map[row.user_id] = row.display_name;
        }
        cache.set(householdId, map);
        if (active) setNames(map);
      } catch (error: unknown) {
        console.warn('Could not load household member names.', error);
      }
    })();

    return () => {
      active = false;
    };
  }, [householdId]);

  return names;
}
