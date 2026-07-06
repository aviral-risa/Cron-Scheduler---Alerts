import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EVDailySummary } from '@/types/evMetrics';
import { format } from 'date-fns';

interface EVDailySummaryTableProps {
  summary: EVDailySummary[];
  loading: boolean;
}

export function EVDailySummaryTable({ summary, loading }: EVDailySummaryTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (summary.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            No daily summary data available for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date descending (most recent first)
  const sortedData = [...summary].sort((a, b) =>
    b.created_at_date.localeCompare(a.created_at_date)
  );

  // Row color coding based on performance
  const getRowClassName = (row: EVDailySummary) => {
    if (row.pct_completed >= 95 && row.pct_error <= 5) {
      return 'bg-green-50 hover:bg-green-100';
    }
    if (row.pct_completed < 90 || row.pct_error > 10) {
      return 'bg-red-50 hover:bg-red-100';
    }
    return 'hover:bg-muted/50';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Summary</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Day-by-day breakdown of EV metrics
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Active %</TableHead>
                <TableHead className="text-right">Inactive %</TableHead>
                <TableHead className="text-right">Completed %</TableHead>
                <TableHead className="text-right">In Progress</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Error %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((day, index) => (
                <TableRow key={`${day.created_at_date}-${day.facility_id}-${index}`} className={getRowClassName(day)}>
                  <TableCell className="font-medium">
                    {format(new Date(day.created_at_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>{day.facility_id}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {day.total_orders}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        day.pct_active >= 80
                          ? 'text-green-600'
                          : day.pct_active >= 70
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }
                    >
                      {day.pct_active.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {day.pct_inactive.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        day.pct_completed >= 95
                          ? 'text-green-600 font-semibold'
                          : day.pct_completed >= 90
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {day.pct_completed.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {day.ev_in_progress}
                  </TableCell>
                  <TableCell className="text-right">
                    {day.ev_error_total}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        day.pct_error <= 5
                          ? 'text-green-600'
                          : day.pct_error <= 10
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {day.pct_error.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
            <span>Good performance (≥95% completed, ≤5% errors)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded" />
            <span>Needs attention ({'<'}90% completed or {'>'}10% errors)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
