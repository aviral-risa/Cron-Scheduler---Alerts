import type { ReactNode } from 'react';
import type { PeopleViewFilters } from '@/types/people';
import { PersonSelector } from './PersonSelector';
import { WeekendToggle } from '../business-view/filters/WeekendToggle';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface PeopleViewLayoutProps {
  children: ReactNode;
  filters: PeopleViewFilters;
  onFiltersChange: (filters: PeopleViewFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function PeopleViewLayout({
  children,
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
}: PeopleViewLayoutProps) {
  return (
    <div className="space-y-6">
      {/* Filter Panel - Single Line Layout */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          {/* Left: Person and Date Range */}
          <div className="flex items-center gap-6">
            <PersonSelector
              selectedPersonId={filters.personId}
              onChange={(personId) =>
                onFiltersChange({ ...filters, personId })
              }
            />

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium whitespace-nowrap">Date Range:</label>
              <input
                type="date"
                value={filters.dateRange.startDate}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    dateRange: { ...filters.dateRange, startDate: e.target.value },
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={filters.dateRange.endDate}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    dateRange: { ...filters.dateRange, endDate: e.target.value },
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </div>
          </div>

          {/* Right: Weekend Toggle and Refresh */}
          <div className="flex items-center gap-4">
            <WeekendToggle
              includeWeekends={filters.includeWeekends}
              onChange={(includeWeekends) =>
                onFiltersChange({ ...filters, includeWeekends })
              }
            />

            <Button
              onClick={onRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div>{children}</div>
    </div>
  );
}
