import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ORGANIZATIONS } from '@/config/organizations';

interface QueueViewLayoutProps {
  header?: ReactNode;
  children: ReactNode;
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
  onFreshSync: () => void;
  onRefreshData: () => void;
  freshSyncLoading: boolean;
  refreshDataLoading: boolean;
  lastUpdated?: string | null;
}

export function QueueViewLayout({
  header,
  children,
  selectedOrgId,
  onOrgChange,
  onFreshSync,
  onRefreshData,
  freshSyncLoading,
  refreshDataLoading,
}: QueueViewLayoutProps) {
  return (
    <div>
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-background pt-6 pb-4 space-y-4">
        {/* Page Header */}
        {header}

        {/* Filter Panel */}
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Organization Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="org-select" className="text-sm font-medium">
              Organization:
            </label>
            <Select value={selectedOrgId} onValueChange={onOrgChange}>
              <SelectTrigger id="org-select" className="w-[250px]">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {ORGANIZATIONS.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onFreshSync}
            disabled={freshSyncLoading || refreshDataLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${freshSyncLoading ? 'animate-spin' : ''}`} />
            {freshSyncLoading ? 'Syncing...' : 'Fresh Sync'}
          </Button>

          <Button
            onClick={onRefreshData}
            disabled={freshSyncLoading || refreshDataLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshDataLoading ? 'animate-spin' : ''}`} />
            {refreshDataLoading ? 'Refreshing...' : 'Refresh Data'}
          </Button>
        </div>
      </div>
      </div>

      {/* Main Content */}
      <div className="pt-4">{children}</div>
    </div>
  );
}
