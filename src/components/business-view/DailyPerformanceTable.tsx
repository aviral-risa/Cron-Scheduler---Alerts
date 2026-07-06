import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface DailyPerformanceRow {
  date: string;
  ordersWorked: number;
  authByRisa: number;
  narAofRest: number;
  activeTeamMembers: number;
  orderPerPerson: number | null;
}

interface DailyPerformanceTableProps {
  data?: DailyPerformanceRow[];
  l7dAvg?: DailyPerformanceRow;
  l30dAvg?: DailyPerformanceRow;
  loading?: boolean;
}

export function DailyPerformanceTable({ data, l7dAvg, l30dAvg, loading }: DailyPerformanceTableProps) {
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
            No performance data available for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (value: number) => value.toLocaleString();
  const formatDecimal = (value: number | null) => value !== null ? value.toFixed(1) : '-';

  // Sort by date descending (latest first)
  const sortedData = [...data].sort((a, b) => {
    return b.date.localeCompare(a.date);
  });

  return (
    <Card className="border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold text-foreground">Date</TableHead>
                <TableHead className="font-semibold text-foreground">Orders Billed</TableHead>
                <TableHead className="font-semibold text-foreground">Auth by RISA</TableHead>
                <TableHead className="font-semibold text-foreground">NAR, AoF & Rest</TableHead>
                <TableHead className="font-semibold text-foreground">Active Team Member</TableHead>
                <TableHead className="font-semibold text-foreground">OPD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow key={row.date} className="hover:bg-muted/30">
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="font-semibold">{formatNumber(row.ordersWorked)}</TableCell>
                  <TableCell>{formatNumber(row.authByRisa)}</TableCell>
                  <TableCell>{formatNumber(row.narAofRest)}</TableCell>
                  <TableCell>{row.activeTeamMembers}</TableCell>
                  <TableCell>{formatDecimal(row.orderPerPerson)}</TableCell>
                </TableRow>
              ))}

              {l7dAvg && (
                <TableRow className="bg-yellow-100 hover:bg-yellow-200 border-t-2">
                  <TableCell className="font-bold">L7D Avg</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.ordersWorked)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.authByRisa)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l7dAvg.narAofRest)}</TableCell>
                  <TableCell className="font-bold">{l7dAvg.activeTeamMembers}</TableCell>
                  <TableCell className="font-bold">{formatDecimal(l7dAvg.orderPerPerson)}</TableCell>
                </TableRow>
              )}

              {l30dAvg && (
                <TableRow className="bg-yellow-100 hover:bg-yellow-200">
                  <TableCell className="font-bold">L30D Avg</TableCell>
                  <TableCell className="font-bold">{formatNumber(l30dAvg.ordersWorked)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l30dAvg.authByRisa)}</TableCell>
                  <TableCell className="font-bold">{formatNumber(l30dAvg.narAofRest)}</TableCell>
                  <TableCell className="font-bold">{l30dAvg.activeTeamMembers}</TableCell>
                  <TableCell className="font-bold">{formatDecimal(l30dAvg.orderPerPerson)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
