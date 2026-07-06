import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrgSelector } from './OrgSelector';
import { DatePicker } from './DatePicker';
import { FreshSyncButton } from './FreshSyncButton';

interface DashboardLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  facilityId: string;
}

export function DashboardLayout({
  children,
  header,
  selectedOrgId,
  onOrgChange,
  selectedDate,
  onDateChange,
  onRefresh,
  refreshing,
  facilityId,
}: DashboardLayoutProps) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      {header}

      {/* Filter Panel */}
      <div className="bg-card rounded-lg border border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <OrgSelector
              selectedOrgId={selectedOrgId}
              onOrgChange={onOrgChange}
            />
            <DatePicker
              selectedDate={selectedDate}
              onDateChange={onDateChange}
            />
          </div>

          <div className="flex items-center gap-2">
            <FreshSyncButton
              facilityId={facilityId}
              date={selectedDate}
              onSyncComplete={onRefresh}
            />

            <Button
              onClick={onRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
      </div>

      {/* Dashboard Content */}
      {children}
    </div>
  );
}
