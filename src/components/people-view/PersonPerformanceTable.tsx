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
import type { DailyPersonPerformance } from '@/types/people';
import { formatPercentage } from '@/utils/metrics';

/**
 * Format IST timestamp to HH:mm display format
 * Input: "14:16" or null → Output: "14:16" or "NA"
 */
function formatTimeDisplay(time: string | null): string {
  if (!time || time.trim() === '') {
    return 'NA';
  }
  return time;
}

interface PersonPerformanceTableProps {
  personName: string;
  dailyBreakdown: DailyPersonPerformance[];
  loading: boolean;
}

export function PersonPerformanceTable({ personName, dailyBreakdown, loading }: PersonPerformanceTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Report Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (dailyBreakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Report Card</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No daily performance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date descending (latest first)
  const sortedDailyBreakdown = [...dailyBreakdown].sort((a, b) => {
    return b.date.localeCompare(a.date);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Card</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Individual team member metrics for selected date range
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Org(s)</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Worked</TableHead>
              <TableHead className="text-right">Work Rate %</TableHead>
              <TableHead className="text-right">Not Worked</TableHead>
              <TableHead className="text-right">Login Time</TableHead>
              <TableHead className="text-right">Logoff Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDailyBreakdown.map((day) => {
              const completionRate = day.completionRate;

              return (
                <TableRow key={day.date}>
                  <TableCell className="font-medium">
                    {personName}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</div>
                    <div className="text-xs text-muted-foreground">{day.dayOfWeek}</div>
                  </TableCell>
                  <TableCell>
                    {day.organizations.join(', ')}
                  </TableCell>
                  <TableCell className="text-right">
                    {day.ordersAssigned}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {day.ordersWorked}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        completionRate !== null && completionRate >= 95
                          ? 'text-green-600 font-semibold'
                          : 'text-red-600 font-semibold'
                      }
                    >
                      {formatPercentage(completionRate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {day.ordersNotWorked}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimeDisplay(day.loginTime)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimeDisplay(day.logoffTime)}
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
