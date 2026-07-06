import type { ReactNode } from 'react';
import type { BillingAnalyticsFilters, BillingClient } from '@/types/billingAnalytics';
import type { BillingDataset } from '@/config/billing-sources.config';
import { BillingClientSelector } from './BillingClientSelector';
import { BillingDatasetToggle } from './BillingDatasetToggle';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface BillingAnalyticsLayoutProps {
  header?: ReactNode;
  children: ReactNode;
  filters: BillingAnalyticsFilters;
  clients: BillingClient[];
  onFiltersChange: (filters: BillingAnalyticsFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
  activeDataset: string | null;
}

export function BillingAnalyticsLayout({
  header,
  children,
  filters,
  clients,
  onFiltersChange,
  onRefresh,
  refreshing,
  activeDataset,
}: BillingAnalyticsLayoutProps) {
  const selectedClient = clients.find((c) => c.facilityId === filters.facilityId);

  return (
    <div>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-background pt-6 pb-4 space-y-4">
        {header}

        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between">
            {/* Left: Client, Date Range */}
            <div className="flex items-center gap-6">
              <BillingClientSelector
                clients={clients}
                selectedFacilityId={filters.facilityId}
                onChange={(facilityId) =>
                  onFiltersChange({ ...filters, facilityId })
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

            {/* Right: Dataset Toggle + Refresh */}
            <div className="flex items-center gap-4">
              {selectedClient && (
                <BillingDatasetToggle
                  dataset={(activeDataset ?? filters.dataset ?? selectedClient.dataset) as BillingDataset}
                  availableDatasets={selectedClient.availableDatasets}
                  onChange={(dataset) =>
                    onFiltersChange({ ...filters, dataset })
                  }
                />
              )}

              <Button
                onClick={onRefresh}
                disabled={refreshing}
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
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
