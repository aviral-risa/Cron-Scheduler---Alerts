interface WeekendToggleProps {
  includeWeekends: boolean;
  onChange: (includeWeekends: boolean) => void;
}

export function WeekendToggle({ includeWeekends, onChange }: WeekendToggleProps) {
  // Invert the logic: when checked, we EXCLUDE weekends (includeWeekends = false)
  const excludeWeekends = !includeWeekends;

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="exclude-weekends"
        checked={excludeWeekends}
        onChange={(e) => onChange(!e.target.checked)}
        className="w-4 h-4 rounded border-border"
      />
      <label htmlFor="exclude-weekends" className="text-sm font-medium cursor-pointer">
        Exclude Weekends & Holidays
      </label>
    </div>
  );
}
