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
import type { PersonMetrics } from '@/types/orders';
import { calculatePercentage, formatPercentage } from '@/utils/metrics';

/**
 * Format IST timestamp to HH:mm display format
 * Input: "2026-01-04 14:16:14" → Output: "14:16"
 * Returns "NA" if timestamp is null or empty
 */
function formatTimeDisplay(timestamp: string | null): string {
  if (!timestamp || timestamp.trim() === '') {
    return 'NA';
  }

  // Extract time portion from "YYYY-MM-DD HH:MM:SS"
  const timePart = timestamp.split(' ')[1];
  if (!timePart) return 'NA';

  // Extract HH:MM from "HH:MM:SS"
  const [hours, minutes] = timePart.split(':');
  return `${hours}:${minutes}`;
}

interface ProviderPerformanceTableProps {
  personMetrics: PersonMetrics[];
  loading: boolean;
}

export function ProviderPerformanceTable({
  personMetrics,
  loading,
}: ProviderPerformanceTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Provider Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (personMetrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Provider Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No provider performance data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by worked_count descending
  const sortedMetrics = [...personMetrics].sort(
    (a, b) => b.worked_count - a.worked_count
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider Performance</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Individual team member metrics for today
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider Name</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Worked</TableHead>
              <TableHead className="text-right">Work Rate %</TableHead>
              <TableHead className="text-right">Not Worked</TableHead>
              <TableHead className="text-right">Login Time</TableHead>
              <TableHead className="text-right">Logoff Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMetrics.map((metric) => {
              const workRate = calculatePercentage(
                metric.worked_count,
                metric.assigned_count,
                1
              );

              return (
                <TableRow key={metric.provider_name}>
                  <TableCell className="font-medium">
                    {metric.provider_name}
                  </TableCell>
                  <TableCell className="text-right">
                    {metric.assigned_count}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {metric.worked_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        workRate !== null && workRate >= 80
                          ? 'text-green-600 font-semibold'
                          : workRate !== null && workRate >= 50
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }
                    >
                      {formatPercentage(workRate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {metric.not_worked_count}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimeDisplay(metric.login_time)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimeDisplay(metric.logoff_time)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
