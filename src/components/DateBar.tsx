import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

const RANGE_LABEL = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const MONTH_LABEL = new Intl.DateTimeFormat('en-MY', { month: 'short' });

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

function monthName(year: number, month: number): string {
  return MONTH_LABEL.format(new Date(year, month, 1));
}

/** Compact monthly period and date-range control for the Insights screen. */
export default function DateBar({ month, onChange }: DateBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(month.getFullYear());

  function openPicker(open: boolean) {
    setPickerOpen(open);
    if (open) setPickerYear(month.getFullYear());
  }

  return (
    <nav className="date-bar" aria-label="Selected period">
      <Popover open={pickerOpen} onOpenChange={openPicker}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="date-bar-period"
            aria-label={`Choose month, currently ${monthName(month.getFullYear(), month.getMonth())} ${month.getFullYear()}`}
          >
            <CalendarDays aria-hidden="true" />
            Monthly
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="month-picker">
          <div className="month-picker-header">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous year"
              onClick={() => setPickerYear((year) => year - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <strong>{pickerYear}</strong>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next year"
              onClick={() => setPickerYear((year) => year + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <div className="month-picker-grid">
            {Array.from({ length: 12 }, (_, monthIndex) => {
              const selected =
                month.getFullYear() === pickerYear && month.getMonth() === monthIndex;
              return (
                <Button
                  key={monthIndex}
                  variant={selected ? 'default' : 'ghost'}
                  size="sm"
                  className="month-picker-option"
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(new Date(pickerYear, monthIndex, 1, 0, 0, 0, 0));
                    setPickerOpen(false);
                  }}
                >
                  {monthName(pickerYear, monthIndex)}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <span className="date-bar-range" aria-live="polite" title={monthRange(month)}>
        {`${monthName(month.getFullYear(), month.getMonth())} ${month.getFullYear()}`}
      </span>
      <div className="date-bar-controls">
        <Button
          variant="ghost"
          size="icon"
          className="date-bar-arrow"
          onClick={() => onChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="date-bar-arrow"
          onClick={() => onChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
