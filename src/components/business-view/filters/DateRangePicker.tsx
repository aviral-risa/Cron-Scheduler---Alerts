import type { DateRange } from '@/types/business';

interface DateRangePickerProps {
  dateRange: DateRange;
  onChange: (dateRange: DateRange) => void;
}

export function DateRangePicker({ dateRange, onChange }: DateRangePickerProps) {
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...dateRange,
      startDate: e.target.value,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...dateRange,
      endDate: e.target.value,
    });
  };

  // Validate date range
  const isValid = dateRange.startDate <= dateRange.endDate;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Date Range (IST)</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dateRange.startDate}
          onChange={handleStartDateChange}
          className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
        />
        <span className="text-muted-foreground">to</span>
        <input
          type="date"
          value={dateRange.endDate}
          onChange={handleEndDateChange}
          className="px-3 py-2 border border-border rounded-md bg-background text-foreground"
        />
      </div>
      {!isValid && (
        <p className="text-xs text-red-600">Start date must be before or equal to end date</p>
      )}
    </div>
  );
}
