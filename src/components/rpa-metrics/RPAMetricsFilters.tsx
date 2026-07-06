import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface RPAMetricsFiltersProps {
  selectedOrg: string;
  selectedDate: string;
  onOrgChange: (orgId: string) => void;
  onDateChange: (date: string) => void;
  onSyncTrigger: () => void;
  isSyncing?: boolean;
}

const FACILITY_OPTIONS = [
  { id: 'HhwIHO4npKhrxyylkC33', name: 'NYCBS', label: 'New York Cancer & Blood Specialists' },
  { id: '3GKbZtgpPru1vJGCkxwR', name: 'MBPCC', label: 'Mary Bird Perkins Cancer Center' },
  { id: '4BlQ4SsqAVTDgFKApKZr', name: 'CHC', label: 'Community Health Center' },
  { id: 'W14MolgUu7OYvX4CFQJn', name: 'UCBC', label: 'University Cancer & Blood Center' },
];

export function RPAMetricsFilters({
  selectedOrg,
  selectedDate,
  onOrgChange,
  onDateChange,
  onSyncTrigger,
  isSyncing = false,
}: RPAMetricsFiltersProps) {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          {/* Organization Dropdown */}
          <div className="flex items-center gap-3 flex-1">
            <label className="text-sm font-medium whitespace-nowrap">Organization:</label>
            <select
              value={selectedOrg}
              onChange={(e) => onOrgChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              {FACILITY_OPTIONS.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-3 flex-1">
            <label className="text-sm font-medium whitespace-nowrap">Created Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Fresh Sync Button */}
          <Button
            onClick={onSyncTrigger}
            disabled={isSyncing}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 flex items-center gap-2 whitespace-nowrap"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isSyncing ? 'animate-spin' : ''}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            Fresh Sync
          </Button>

          {/* Refreshing Indicator */}
          {isSyncing && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-sm">Refreshing...</span>
            </div>
          )}
        </div>

        {/* Info Text */}
        <div className="text-xs text-muted-foreground mt-4">
          <p>
            Tip: Use "Fresh Sync" to fetch the most recent RPA metrics from Algolia before viewing data.
            Data is synced for the selected date and organization.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
