import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface ApprovalRateTrendingRow {
  date: string;
  totalAuthInitiated: number;
  authByRisa: number;
  denialByRisa: number;
  denialAfterQuery: number;
  paApprovalRate: number | null;
  overallApprovalRate: number | null;
}

interface ApprovalRateTrendingTableProps {
  data?: ApprovalRateTrendingRow[];
  l7dAvg?: ApprovalRateTrendingRow;
  loading?: boolean;
}

export function ApprovalRateTrendingTable({ data, l7dAvg, loading }: ApprovalRateTrendingTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            No approval rate data available for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (value: number) => value.toLocaleString();
  const formatRate = (value: number | null) => value !== null ? `${value.toFixed(1)}%` : '-';

  // Sort by date descending (latest first)
  const sortedData = [...data].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className="border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold text-foreground">Date</TableHead>
                <TableHead className="font-semibold text-foreground">Total Auth Initiated</TableHead>
                <TableHead className="font-semibold text-foreground">Auth by RISA</TableHead>
                <TableHead className="font-semibold text-foreground">Denial by RISA</TableHead>
                <TableHead className="font-semibold text-foreground">Denial After Query</TableHead>
                <TableHead className="font-semibold text-foreground">RISA Approval Rate</TableHead>
                <TableHead className="font-semibold text-foreground">Overall Approval Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow key={row.date} className="hover:bg-muted/30">
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="font-semibold">{formatNumber(row.totalAuthInitiated)}</TableCell>
                  <TableCell>{formatNumber(row.authByRisa)}</TableCell>
                  <TableCell>{formatNumber(row.denialByRisa)}</TableCell>
                  <TableCell>{formatNumber(row.denialAfterQuery)}</TableCell>
                  <TableCell className="font-semibold">{formatRate(row.paApprovalRate)}</TableCell>
                  <TableCell className="font-semibold">{formatRate(row.overallApprovalRate)}</TableCell>
                </TableRow>
              ))}

              {l7dAvg && (
                <TableRow className="bg-yellow-100 hover:bg-yellow-200 border-t-2">
                  <TableCell className="font-bold">L7D Avg</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.totalAuthInitiated)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.authByRisa)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.denialByRisa)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.denialAfterQuery)}</TableCell>
                  <TableCell className="font-bold">{formatRate(l7dAvg.paApprovalRate)}</TableCell>
                  <TableCell className="font-bold">{formatRate(l7dAvg.overallApprovalRate)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
