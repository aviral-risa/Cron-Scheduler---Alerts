interface DatePickerProps {
  selectedDate: string; // YYYY-MM-DD format
  onDateChange: (date: string) => void;
}

export function DatePicker({ selectedDate, onDateChange }: DatePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="date-picker" className="text-sm font-medium">
        Created Date:
      </label>
      <input
        type="date"
        id="date-picker"
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="h-10 w-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
    </div>
  );
}
