import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface HouseholdActivity {
  id: string;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string | null;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

export interface HouseholdPresence {
  connected: boolean;
  onlineUserIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function activityRow(row: Record<string, unknown>): HouseholdActivity | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.table_name !== 'string' ||
    (row.action !== 'INSERT' && row.action !== 'UPDATE' && row.action !== 'DELETE') ||
    typeof row.changed_at !== 'string'
  ) {
    return null;
  }
  return {
    id: row.id,
    table_name: row.table_name,
    record_id: typeof row.record_id === 'string' ? row.record_id : null,
    action: row.action,
    changed_by: typeof row.changed_by === 'string' ? row.changed_by : null,
    changed_at: row.changed_at,
    old_values: isRecord(row.old_values) ? row.old_values : null,
    new_values: isRecord(row.new_values) ? row.new_values : null,
  };
}

export function useRecentHouseholdActivity(householdId: string | null): HouseholdActivity[] {
  const [activities, setActivities] = useState<HouseholdActivity[]>([]);

  useEffect(() => {
    if (!householdId) {
      setActivities([]);
      return;
    }

    let active = true;
    async function load() {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, table_name, record_id, action, changed_by, changed_at, old_values, new_values')
        .eq('household_id', householdId)
        .order('changed_at', { ascending: false })
        .limit(8);
      if (!active || error || !data) return;
      setActivities(
        (data as unknown as Record<string, unknown>[])
          .map(activityRow)
          .filter((row): row is HouseholdActivity => row !== null),
      );
    }

    void load();
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, [householdId]);

  return activities;
}

function readPresenceIds(channel: ReturnType<typeof supabase.channel>): Set<string> {
  const state = channel.presenceState<{ user_id?: string }>();
  const ids = new Set<string>();
  for (const [key, entries] of Object.entries(state)) {
    const userId = entries[0]?.user_id;
    ids.add(typeof userId === 'string' ? userId : key);
  }
  return ids;
}

export function useHouseholdPresence(
  householdId: string | null,
  userId: string | null,
  displayName: string | null,
): HouseholdPresence {
  const [presence, setPresence] = useState<HouseholdPresence>({
    connected: false,
    onlineUserIds: new Set(),
  });

  useEffect(() => {
    if (!householdId || !userId) {
      setPresence({ connected: false, onlineUserIds: new Set() });
      return;
    }

    let active = true;
    const channel = supabase.channel(`household-presence:${householdId}`, {
      config: { presence: { key: userId } },
    });
    const syncPresence = () => {
      if (active) setPresence({ connected: true, onlineUserIds: readPresenceIds(channel) });
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            display_name: displayName,
            online_at: new Date().toISOString(),
          });
          syncPresence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setPresence({ connected: false, onlineUserIds: new Set() });
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [householdId, userId, displayName]);

  return presence;
}

export function activityTitle(activity: HouseholdActivity): string {
  const values = activity.new_values ?? activity.old_values;
  const note = typeof values?.note === 'string' ? values.note.trim() : '';
  const title = note || (typeof values?.chip === 'string' ? values.chip : '') || 'transaction';
  const subject = activity.table_name === 'budgets' ? 'budget' : title;
  return `${activity.action === 'INSERT' ? 'added' : activity.action === 'UPDATE' ? 'updated' : 'removed'} ${subject}`;
}
