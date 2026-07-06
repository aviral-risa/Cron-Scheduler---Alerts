import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { DosCoverageRow } from '@/types/dosCoverage';

interface DosCoverageTableProps {
  data?: DosCoverageRow[];
  loading?: boolean;
}

export function DosCoverageTable({ data, loading }: DosCoverageTableProps) {
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
            No DoS coverage data available for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (value: number) => value.toLocaleString();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  // Sort by date descending (latest first)
  const sortedData = [...data].sort((a, b) => b.date.localeCompare(a.date));

  // Calculate TOTAL row
  const totals: DosCoverageRow = {
    date: 'TOTAL',
    totalOrders: data.reduce((s, r) => s + r.totalOrders, 0),
    bucket0to7: data.reduce((s, r) => s + r.bucket0to7, 0),
    bucket8to14: data.reduce((s, r) => s + r.bucket8to14, 0),
    bucket15to21: data.reduce((s, r) => s + r.bucket15to21, 0),
    bucket21plus: data.reduce((s, r) => s + (r.bucket21plus || 0), 0),
    ordersWorked: data.reduce((s, r) => s + (r.ordersWorked || 0), 0),
    worked0to7: data.reduce((s, r) => s + (r.worked0to7 || 0), 0),
    worked8to14: data.reduce((s, r) => s + (r.worked8to14 || 0), 0),
    worked15to21: data.reduce((s, r) => s + (r.worked15to21 || 0), 0),
    worked21plus: data.reduce((s, r) => s + (r.worked21plus || 0), 0),
  };

  return (
    <Card className="border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {/* Group header row */}
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-0">
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Date</TableHead>
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Total Orders</TableHead>
                <TableHead colSpan={4} className="font-semibold text-foreground text-center border-r">Loaded by DoS Bucket</TableHead>
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Orders Worked</TableHead>
                <TableHead colSpan={4} className="font-semibold text-foreground text-center">Worked by DoS Bucket</TableHead>
              </TableRow>
              {/* Sub-header row */}
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold text-foreground text-center">T+0-7</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+8-14</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+15-21</TableHead>
                <TableHead className="font-semibold text-foreground text-center border-r">T+21+</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+0-7</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+8-14</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+15-21</TableHead>
                <TableHead className="font-semibold text-foreground text-center">T+21+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow key={row.date} className="hover:bg-muted/30">
                  <TableCell className="border-r">{formatDate(row.date)}</TableCell>
                  <TableCell className="font-semibold border-r">{formatNumber(row.totalOrders)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.bucket0to7)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.bucket8to14)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.bucket15to21)}</TableCell>
                  <TableCell className="text-center border-r">{formatNumber(row.bucket21plus || 0)}</TableCell>
                  <TableCell className="font-semibold border-r">{formatNumber(row.ordersWorked || 0)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.worked0to7 || 0)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.worked8to14 || 0)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.worked15to21 || 0)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.worked21plus || 0)}</TableCell>
                </TableRow>
              ))}

              {/* TOTAL row */}
              <TableRow className="bg-yellow-100 hover:bg-yellow-200 border-t-2">
                <TableCell className="font-bold border-r">TOTAL</TableCell>
                <TableCell className="font-bold border-r">{formatNumber(totals.totalOrders)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.bucket0to7)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.bucket8to14)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.bucket15to21)}</TableCell>
                <TableCell className="font-bold text-center border-r">{formatNumber(totals.bucket21plus)}</TableCell>
                <TableCell className="font-bold border-r">{formatNumber(totals.ordersWorked)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.worked0to7)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.worked8to14)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.worked15to21)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.worked21plus)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
