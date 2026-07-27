const RANGE_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

interface DateBarProps {
  /** A date within the currently selected month. */
  month: Date;
  onChange: (month: Date) => void;
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

function monthRange(month: Date): string {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return `${RANGE_LABEL.format(first)} – ${RANGE_LABEL.format(last)}`;
}

/** Compact monthly period and date-range control for the Insights screen. */
export default function DateBar({ month, onChange }: DateBarProps) {
  return (
    <nav className="date-bar" aria-label="Selected period">
      <span className="date-bar-period" aria-label="Period: monthly">
        Monthly
      </span>
      <span className="date-bar-range" aria-live="polite">
        {monthRange(month)}
      </span>
      <div className="date-bar-controls">
        <button
          type="button"
          className="date-bar-arrow"
          onClick={() => onChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="date-bar-arrow"
          onClick={() => onChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </nav>
  );
}
