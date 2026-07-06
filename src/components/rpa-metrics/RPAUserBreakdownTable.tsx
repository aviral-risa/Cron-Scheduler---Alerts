import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RPAUserBreakdown } from '@/types/rpaMetrics';

interface RPAUserBreakdownTableProps {
  userBreakdown: RPAUserBreakdown[];
  loading: boolean;
}

export function RPAUserBreakdownTable({ userBreakdown, loading }: RPAUserBreakdownTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User RPA Automation Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (userBreakdown.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User RPA Automation Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No user breakdown data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by comment automation % (ascending) to highlight manual workers
  const sortedData = [...userBreakdown].sort((a, b) => a.pct_comment_automation - b.pct_comment_automation);

  return (
    <Card>
      <CardHeader>
        <CardTitle>User RPA Automation Breakdown</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Identify users working manually vs triggering RPAs (sorted by lowest automation %)
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Comment Manual</TableHead>
                <TableHead className="text-right">Comment Auto</TableHead>
                <TableHead className="text-right">Comment %</TableHead>
                <TableHead className="text-right">Document Manual</TableHead>
                <TableHead className="text-right">Document Auto</TableHead>
                <TableHead className="text-right">Document %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((user, idx) => {
                // Highlight rows with low automation (<50%)
                const isLowAutomation = user.pct_comment_automation < 50 || user.pct_document_automation < 50;
                const rowClass = isLowAutomation ? 'bg-red-50 hover:bg-red-100' : '';

                return (
                  <TableRow key={`${user.facility_id}-${user.username}-${idx}`} className={rowClass}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell className="text-right">{user.total_orders}</TableCell>
                    <TableCell className="text-right">{user.comment_rpa_manual}</TableCell>
                    <TableCell className="text-right">{user.comment_rpa_automated}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {user.pct_comment_automation.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">{user.document_rpa_manual}</TableCell>
                    <TableCell className="text-right">{user.document_rpa_automated}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {user.pct_document_automation.toFixed(1)}%
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
            <span>Low automation rate (&lt; 50%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
