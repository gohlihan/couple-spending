const MONTH_LABEL = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

interface DateBarProps {
  /** A date within the currently selected month. */
  month: Date;
  onChange: (month: Date) => void;
}

/** Add `delta` months to `date`, snapped to the first of the month. */
function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

/**
 * Top month picker. Prev/next arrows step whole months; the label shows the
 * selected month (e.g. "July 2026"). Defaults to the current month via the
 * parent's initial state. A month-grid picker is a deferred nicety.
 */
export default function DateBar({ month, onChange }: DateBarProps) {
  return (
    <nav className="date-bar" aria-label="Select month">
      <button
        type="button"
        className="date-bar-arrow"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="date-bar-label" aria-live="polite">
        {MONTH_LABEL.format(month)}
      </span>
      <button
        type="button"
        className="date-bar-arrow"
        onClick={() => onChange(addMonths(month, 1))}
        aria-label="Next month"
      >
        ›
      </button>
    </nav>
  );
}
