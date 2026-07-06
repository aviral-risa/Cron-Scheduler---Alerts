import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonQueueTable } from '@/components/business-view/PersonQueueTable';
import { QueueViewLayout } from '@/components/queue-view/QueueViewLayout';
import { useQueueData } from '@/hooks/useQueueData';
import { ORGANIZATIONS } from '@/config/organizations';
import { PageIntro } from '@/components/layout/PageIntro';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PAGE_INTRODUCTIONS } from '@/config/page-introductions';

/**
 * Format timestamp to IST display format
 * The timestamp from backend is already in IST, we just need to format it nicely
 */
function formatTimestampIST(timestamp: string): string {
  // Parse the timestamp (format: "YYYY-MM-DD HH:MM:SS")
  const date = new Date(timestamp);

  // Format as readable date and time with IST timezone
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  };

  const formatted = new Intl.DateTimeFormat('en-IN', options).format(date);
  return `${formatted} IST`;
}

export function QueueView() {
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');

  const {
    queueData,
    loading,
    error,
    lastUpdated,
    refreshFromSheets,
    freshSync,
  } = useQueueData();

  // Separate loading states for each button
  const [freshSyncLoading, setFreshSyncLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  // Filter data based on selected organization
  const filteredData = selectedOrgId === 'all'
    ? queueData
    : queueData.filter(d => {
        const org = ORGANIZATIONS.find(o => o.facilityId === d.facilityId);
        return org?.id === selectedOrgId;
      });

  const handleFreshSync = async () => {
    setFreshSyncLoading(true);
    try {
      await freshSync();
    } finally {
      setFreshSyncLoading(false);
    }
  };

  const handleRefreshData = async () => {
    setRefreshLoading(true);
    try {
      await refreshFromSheets();
    } finally {
      setRefreshLoading(false);
    }
  };

  // Check if data is stale (> 2 hours old)
  const isDataStale = lastUpdated &&
    (Date.now() - new Date(lastUpdated).getTime()) > 2 * 60 * 60 * 1000;

  return (
    <TooltipProvider>
      <QueueViewLayout
        header={
          <PageIntro
            title={PAGE_INTRODUCTIONS.queueView.title}
            description={PAGE_INTRODUCTIONS.queueView.description}
          />
        }
        selectedOrgId={selectedOrgId}
        onOrgChange={setSelectedOrgId}
        onFreshSync={handleFreshSync}
        onRefreshData={handleRefreshData}
        freshSyncLoading={freshSyncLoading || loading}
        refreshDataLoading={refreshLoading || loading}
        lastUpdated={lastUpdated}
      >
        {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-semibold">Error loading queue data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Stale Data Warning */}
      {isDataStale && !loading && !error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
          <p className="text-yellow-800 text-sm">
            ⚠️ Data may be stale (last updated {formatTimestampIST(lastUpdated!)}).
            Consider clicking "Fresh Sync" for the latest information.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Queue Summary</h2>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {formatTimestampIST(lastUpdated)}
            </p>
          )}
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredData && filteredData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total New
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.new, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Orders with New status</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.pending, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Orders with Pending status</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Query
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.query, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Orders with Query status</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Hold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.hold, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Orders with Hold status</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Auth Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.authRequired, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Orders with Auth Required status</p>
              </CardContent>
            </Card>

            <Card className="border-primary bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Open Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filteredData.reduce((sum, d) => sum + d.totalOpenOrders, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Sum of all queue statuses</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                No queue data available. Click "Fresh Sync" to load queue information from Algolia.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Queue Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Person-Level Queue Breakdown</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Current queue counts for each team member in their assigned organization.
          Daily snapshots are stored permanently in the Queue spreadsheet at 11:59 PM IST.
        </p>
        <PersonQueueTable data={filteredData} loading={loading} />
      </div>
      </QueueViewLayout>
    </TooltipProvider>
  );
}
