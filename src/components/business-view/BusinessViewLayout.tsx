import type { ReactNode } from 'react';
import type { BusinessViewFilters } from '@/types/business';
import { MultiOrgSelectorDropdown } from './filters/MultiOrgSelectorDropdown';
import { DateRangePicker } from './filters/DateRangePicker';
import { WeekendToggle } from './filters/WeekendToggle';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface BusinessViewLayoutProps {
  header?: ReactNode;
  children: ReactNode;
  filters: BusinessViewFilters;
  onFiltersChange: (filters: BusinessViewFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function BusinessViewLayout({
  header,
  children,
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
}: BusinessViewLayoutProps) {
  return (
    <div>
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-background pt-6 pb-4 space-y-4">
        {/* Page Header */}
        {header}

        {/* Filter Panel - Single Line Layout */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Left: Organization and Date Range */}
          <div className="flex items-center gap-6">
            <MultiOrgSelectorDropdown
              selectedOrgIds={filters.organizationIds}
              onChange={(organizationIds) =>
                onFiltersChange({ ...filters, organizationIds })
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
      </div>

      {/* Main Content */}
      <div className="pt-4">{children}</div>
    </div>
  );
}
