import type { ReactNode } from 'react';
import type { AgentModeMetricsFilters } from '@/types/agentModeMetrics';
import { MultiOrgSelectorDropdown } from '../business-view/filters/MultiOrgSelectorDropdown';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface AgentModeMetricsViewLayoutProps {
  header?: ReactNode;
  children: ReactNode;
  filters: AgentModeMetricsFilters;
  onFiltersChange: (filters: AgentModeMetricsFilters) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}

export function AgentModeMetricsViewLayout({
  header,
  children,
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
}: AgentModeMetricsViewLayoutProps) {
  return (
    <div>
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-background pt-6 pb-4 space-y-4">
        {/* Page Header */}
        {header}

        {/* Filter Panel */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
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

          {/* Right: Refresh Button */}
          <div className="flex items-center gap-2">
            <Button
              onClick={onRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
              />
              Refresh
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
