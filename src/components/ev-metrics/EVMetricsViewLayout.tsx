import type { ReactNode } from 'react';
import type { EVMetricsFilters } from '@/types/evMetrics';
import { MultiOrgSelectorDropdown } from '../business-view/filters/MultiOrgSelectorDropdown';
import { Button } from '@/components/ui/button';
import { RefreshCw, Sheet } from 'lucide-react';

interface EVMetricsViewLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  filters: EVMetricsFilters;
  onFiltersChange: (filters: EVMetricsFilters) => void;
  onRefresh: () => Promise<void>;
  onRefreshFromSheets: () => Promise<void>;
  refreshing: boolean;
}

export function EVMetricsViewLayout({
  children,
  header,
  filters,
  onFiltersChange,
  onRefresh,
  onRefreshFromSheets,
  refreshing,
}: EVMetricsViewLayoutProps) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      {header}

      {/* Filter Panel */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          {/* Left: Organization and Date Range */}
          <div className="flex items-center gap-6">
            <MultiOrgSelectorDropdown
              selectedOrgIds={filters.organizationIds}
              onChange={(organizationIds) =>
                onFiltersChange({ ...filters, organizationIds })
              }
              hideAllOption={true}
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

          {/* Right: Refresh Buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={onRefresh}
              disabled={refreshing}
              variant="default"
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
              />
              Fresh Sync
            </Button>

            <Button
              onClick={onRefreshFromSheets}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <Sheet className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div>{children}</div>
    </div>
  );
}
