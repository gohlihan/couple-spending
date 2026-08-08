import { useEffect, useState } from 'react';

/** Keep date-sensitive views current while an installed PWA stays open. */
export function useCurrentLocalDate(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: number | undefined;

    function scheduleNextMidnight() {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const delay = Math.max(nextMidnight.getTime() - now.getTime(), 1000);
      timeoutId = window.setTimeout(() => {
        setToday(new Date());
        scheduleNextMidnight();
      }, delay);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        setToday(new Date());
        scheduleNextMidnight();
      }
    }

    scheduleNextMidnight();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return today;
}
