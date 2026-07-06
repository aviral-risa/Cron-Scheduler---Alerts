import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EVDailySummary } from '@/types/evMetrics';
import { useState } from 'react';
import { format } from 'date-fns';

interface EVSuccessRateTableProps {
  summary: EVDailySummary[];
  loading: boolean;
}

export function EVSuccessRateTable({ summary, loading }: EVSuccessRateTableProps) {
  const [showPercentage, setShowPercentage] = useState(true);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>EV Success Rate - Last 7 Days</CardTitle>
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
          <CardTitle>EV Success Rate - Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-12">
            No data available for the selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Aggregate data by date (sum across all facilities for each date)
  const dateMap = new Map<string, EVDailySummary>();

  summary.forEach((s) => {
    const datePart = s.created_at_date.split(' ')[0]; // Extract YYYY-MM-DD

    if (dateMap.has(datePart)) {
      const existing = dateMap.get(datePart)!;
      // Sum up metrics
      existing.total_orders += s.total_orders;
      existing.orders_active += s.orders_active;
      existing.orders_inactive += s.orders_inactive;
      existing.orders_unknown += s.orders_unknown;
      existing.ev_completed += s.ev_completed;
      existing.ev_error_total += s.ev_error_total;
    } else {
      dateMap.set(datePart, {
        ...s,
        created_at_date: datePart,
      });
    }
  });

  // Convert to array and sort by date descending (latest first)
  let aggregatedByDate = Array.from(dateMap.values()).sort(
    (a, b) => b.created_at_date.localeCompare(a.created_at_date)
  );

  // Limit to last 7 dates if more than 7
  if (aggregatedByDate.length > 7) {
    aggregatedByDate = aggregatedByDate.slice(0, 7);
  }

  // Recalculate percentages for aggregated data
  const tableData = aggregatedByDate.map((s) => {
    const pct_completed = s.total_orders > 0 ? (s.ev_completed / s.total_orders) * 100 : 0;
    const pct_error = s.total_orders > 0 ? (s.ev_error_total / s.total_orders) * 100 : 0;
    const pct_active = s.total_orders > 0 ? (s.orders_active / s.total_orders) * 100 : 0;
    const pct_inactive = s.total_orders > 0 ? (s.orders_inactive / s.total_orders) * 100 : 0;
    const pct_unknown = s.total_orders > 0 ? (s.orders_unknown / s.total_orders) * 100 : 0;

    return {
      date: s.created_at_date,
      displayDate: format(new Date(s.created_at_date), 'MMM d, yyyy'),
      total_orders: s.total_orders,
      ev_completed: s.ev_completed,
      ev_error_total: s.ev_error_total,
      orders_active: s.orders_active,
      orders_inactive: s.orders_inactive,
      orders_unknown: s.orders_unknown,
      pct_completed,
      pct_error,
      pct_active,
      pct_inactive,
      pct_unknown,
    };
  });

  const formatValue = (count: number, percentage: number) => {
    return showPercentage ? `${percentage.toFixed(1)}%` : count.toString();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>EV Success Rate - Last 7 Days</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Daily EV performance metrics (latest date on top)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPercentage(!showPercentage)}
        >
          Show {showPercentage ? 'Counts' : 'Percentages'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Error</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Inactive</TableHead>
                <TableHead className="text-right">Not Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="font-medium">{row.displayDate}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {row.total_orders}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        row.pct_completed >= 95
                          ? 'text-green-600 font-semibold'
                          : row.pct_completed >= 90
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {formatValue(row.ev_completed, row.pct_completed)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        row.pct_error <= 5
                          ? 'text-green-600'
                          : row.pct_error <= 10
                            ? 'text-yellow-600'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {formatValue(row.ev_error_total, row.pct_error)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        row.pct_active >= 80
                          ? 'text-green-600 font-semibold'
                          : row.pct_active >= 70
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }
                    >
                      {formatValue(row.orders_active, row.pct_active)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={row.pct_inactive > 10 ? 'text-red-600' : 'text-gray-600'}>
                      {formatValue(row.orders_inactive, row.pct_inactive)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={row.pct_unknown > 10 ? 'text-yellow-600' : 'text-gray-600'}>
                      {formatValue(row.orders_unknown, row.pct_unknown)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <p className="font-semibold mb-2">Performance Targets:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="text-green-600 font-semibold">Completed</span>: Target ≥95% (Good: ≥95%, Warning: 90-95%, Critical: &lt;90%)</li>
            <li><span className="text-green-600">Error</span>: Target ≤5% (Good: ≤5%, Warning: 5-10%, Critical: &gt;10%)</li>
            <li><span className="text-green-600 font-semibold">Active</span>: Target ≥80% (Good: ≥80%, Warning: 70-80%, Critical: &lt;70%)</li>
          </ul>
          <p className="mt-2 italic">
            Note: Shows last {tableData.length} day{tableData.length !== 1 ? 's' : ''} of data (max 7 days)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
