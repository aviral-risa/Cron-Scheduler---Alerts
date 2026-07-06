/**
 * Orders Funnel Table Component
 * Shows daily progression from loaded → assigned → completed with percentages and L7D/L30D averages
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrdersFunnelSummary } from '@/types/business';
import { formatNumber, formatPercentage } from '@/utils/metrics';

interface OrdersFunnelTableProps {
  data: OrdersFunnelSummary | undefined;
  loading: boolean;
}

function formatDate(dateStr: string): string {
  // Handle L7D Avg and L30D Avg rows
  if (dateStr.startsWith('L')) {
    return dateStr;
  }

  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function OrdersFunnelTable({ data, loading }: OrdersFunnelTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.dailyBreakdown.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            No data available for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date descending (most recent first)
  const sortedDaily = [...data.dailyBreakdown].sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium">Date</TableHead>
                <TableHead className="text-right font-medium">Orders Loaded</TableHead>
                <TableHead className="text-right font-medium">Orders Assigned</TableHead>
                <TableHead className="text-right font-medium">% Assigned / Loaded</TableHead>
                <TableHead className="text-right font-medium">Orders Completed</TableHead>
                <TableHead className="text-right font-medium">% Completed / Assigned</TableHead>
                <TableHead className="text-right font-medium">% Completed / Today</TableHead>
                <TableHead className="text-right font-medium">% In-Progress / Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Daily breakdown rows */}
              {sortedDaily.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                  <TableCell className="text-right">{formatNumber(day.ordersLoaded)}</TableCell>
                  <TableCell className="text-right">{formatNumber(day.ordersAssigned)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPercentage(day.pctAssignedOfLoaded)}
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold">
                    {formatNumber(day.ordersCompleted)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPercentage(day.pctCompletedOfAssigned)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPercentage(day.pctCompletedOfLoaded)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPercentage(day.pctInProgressOfLoaded)}
                  </TableCell>
                </TableRow>
              ))}

              {/* L7D Average row */}
              <TableRow className="bg-primary-50 hover:bg-primary-100 border-t-2">
                <TableCell className="font-bold">{data.l7dAvg.date}</TableCell>
                <TableCell className="text-right font-semibold">{formatNumber(data.l7dAvg.ordersLoaded)}</TableCell>
                <TableCell className="text-right font-semibold">{formatNumber(data.l7dAvg.ordersAssigned)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l7dAvg.pctAssignedOfLoaded)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatNumber(data.l7dAvg.ordersCompleted)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l7dAvg.pctCompletedOfAssigned)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l7dAvg.pctCompletedOfLoaded)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l7dAvg.pctInProgressOfLoaded)}
                </TableCell>
              </TableRow>

              {/* L30D Average row */}
              <TableRow className="bg-blue-50 hover:bg-blue-100">
                <TableCell className="font-bold">{data.l30dAvg.date}</TableCell>
                <TableCell className="text-right font-semibold">{formatNumber(data.l30dAvg.ordersLoaded)}</TableCell>
                <TableCell className="text-right font-semibold">{formatNumber(data.l30dAvg.ordersAssigned)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l30dAvg.pctAssignedOfLoaded)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatNumber(data.l30dAvg.ordersCompleted)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l30dAvg.pctCompletedOfAssigned)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l30dAvg.pctCompletedOfLoaded)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatPercentage(data.l30dAvg.pctInProgressOfLoaded)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
