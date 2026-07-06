/**
 * Open Orders Summary Table Component
 * Shows daily breakdown of open orders (worked but not yet authorized/denied)
 * Open Orders = Orders with date_of_work and status: Auth Required, Pending, Hold, or Query
 */

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface OpenOrdersRow {
  date: string;
  totalOpenOrders: number;
  authRequired: number;
  pending: number;
  hold: number;
  query: number;
}

interface OpenOrdersSummaryTableProps {
  data?: OpenOrdersRow[];
  loading?: boolean;
}

export function OpenOrdersSummaryTable({ data, loading }: OpenOrdersSummaryTableProps) {
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
            No open orders data available for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (value: number) => value.toLocaleString();

  // Sort by date descending (latest first)
  const sortedData = [...data].sort((a, b) => {
    return b.date.localeCompare(a.date);
  });

  // Calculate totals for summary row
  const totals = sortedData.reduce(
    (acc, row) => ({
      totalOpenOrders: acc.totalOpenOrders + row.totalOpenOrders,
      authRequired: acc.authRequired + row.authRequired,
      pending: acc.pending + row.pending,
      hold: acc.hold + row.hold,
      query: acc.query + row.query,
    }),
    { totalOpenOrders: 0, authRequired: 0, pending: 0, hold: 0, query: 0 }
  );

  return (
    <Card className="border border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold text-foreground">Date</TableHead>
                <TableHead className="font-semibold text-foreground">Auth Required</TableHead>
                <TableHead className="font-semibold text-foreground">Pending</TableHead>
                <TableHead className="font-semibold text-foreground">Hold</TableHead>
                <TableHead className="font-semibold text-foreground">Query</TableHead>
                <TableHead className="font-semibold text-foreground">Total Open Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow key={row.date} className="hover:bg-muted/30">
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{formatNumber(row.authRequired)}</TableCell>
                  <TableCell>{formatNumber(row.pending)}</TableCell>
                  <TableCell>{formatNumber(row.hold)}</TableCell>
                  <TableCell>{formatNumber(row.query)}</TableCell>
                  <TableCell className="font-semibold">{formatNumber(row.totalOpenOrders)}</TableCell>
                </TableRow>
              ))}

              {/* Totals Row */}
              <TableRow className="bg-muted font-bold border-t-2 border-border">
                <TableCell>TOTAL</TableCell>
                <TableCell>{formatNumber(totals.authRequired)}</TableCell>
                <TableCell>{formatNumber(totals.pending)}</TableCell>
                <TableCell>{formatNumber(totals.hold)}</TableCell>
                <TableCell>{formatNumber(totals.query)}</TableCell>
                <TableCell>{formatNumber(totals.totalOpenOrders)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
