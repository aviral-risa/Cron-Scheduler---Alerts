import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RPADailySummary } from '@/types/rpaMetrics';

interface RPAStatusBreakdownTableProps {
  summaries: RPADailySummary[];
  loading: boolean;
}

export function RPAStatusBreakdownTable({ summaries, loading }: RPAStatusBreakdownTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RPA Status Breakdown by Date</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RPA Status Breakdown by Date</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No RPA status data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by date (most recent first)
  const sortedData = [...summaries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>RPA Status Breakdown by Date</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Daily breakdown of RPA triggers, successes, and errors
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Comment: Not Init</TableHead>
                <TableHead className="text-right">Comment: Success</TableHead>
                <TableHead className="text-right">Comment: Error</TableHead>
                <TableHead className="text-right">Doc: Not Init</TableHead>
                <TableHead className="text-right">Doc: Success</TableHead>
                <TableHead className="text-right">Doc: Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((summary, idx) => {
                // Highlight rows with high error rates
                const errorRate = summary.pct_overall_rpa_failure;
                const isHighError = errorRate > 10;
                const rowClass = isHighError ? 'bg-red-50 hover:bg-red-100' : '';

                return (
                  <TableRow key={`${summary.facility_id}-${summary.date}-${idx}`} className={rowClass}>
                    <TableCell className="font-medium">{summary.date}</TableCell>
                    <TableCell className="text-right">{summary.total_orders_worked}</TableCell>
                    <TableCell className="text-right">{summary.comment_rpa_not_initiated}</TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {summary.comment_rpa_success}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {summary.comment_rpa_error}
                    </TableCell>
                    <TableCell className="text-right">{summary.document_rpa_not_initiated}</TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {summary.document_rpa_success}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {summary.document_rpa_error}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
            <span>High error rate (&gt; 10%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
