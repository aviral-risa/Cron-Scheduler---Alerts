import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { PayerTreatmentAgingRow } from '@/types/payerTreatmentAging';
import { getOrganizationByFacilityId } from '@/config/organizations';

interface PayerTreatmentAgingTableProps {
  data?: PayerTreatmentAgingRow[];
  loading?: boolean;
}

export function PayerTreatmentAgingTable({ data, loading }: PayerTreatmentAgingTableProps) {
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
            No payer treatment aging data available for the selected period
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

  const getOrgName = (facilityId: string) => {
    const org = getOrganizationByFacilityId(facilityId);
    return org?.name || facilityId;
  };

  // Sort by date descending, then org, then payer
  const sortedData = [...data].sort((a, b) => {
    const dateCompare = b.created_at_date.localeCompare(a.created_at_date);
    if (dateCompare !== 0) return dateCompare;
    const orgCompare = getOrgName(a.facility_id).localeCompare(getOrgName(b.facility_id));
    if (orgCompare !== 0) return orgCompare;
    return a.payer_name.localeCompare(b.payer_name);
  });

  // Calculate TOTAL row
  const totals = {
    total_orders_loaded: data.reduce((s, r) => s + r.total_orders_loaded, 0),
    total_orders_billed: data.reduce((s, r) => s + r.total_orders_billed, 0),
    loaded_0_to_7: data.reduce((s, r) => s + r.loaded_0_to_7, 0),
    loaded_8_to_14: data.reduce((s, r) => s + r.loaded_8_to_14, 0),
    loaded_15_to_21: data.reduce((s, r) => s + r.loaded_15_to_21, 0),
    loaded_21_plus: data.reduce((s, r) => s + r.loaded_21_plus, 0),
    billed_0_to_7: data.reduce((s, r) => s + r.billed_0_to_7, 0),
    billed_8_to_14: data.reduce((s, r) => s + r.billed_8_to_14, 0),
    billed_15_to_21: data.reduce((s, r) => s + r.billed_15_to_21, 0),
    billed_21_plus: data.reduce((s, r) => s + r.billed_21_plus, 0),
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
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Org</TableHead>
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Payer</TableHead>
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Loaded</TableHead>
                <TableHead rowSpan={2} className="font-semibold text-foreground align-bottom border-r">Billed</TableHead>
                <TableHead colSpan={4} className="font-semibold text-foreground text-center border-r">Loaded by DoS Bucket</TableHead>
                <TableHead colSpan={4} className="font-semibold text-foreground text-center">Billed by DoS Bucket</TableHead>
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
              {sortedData.map((row, idx) => (
                <TableRow key={`${row.created_at_date}-${row.facility_id}-${row.payer_name}-${idx}`} className="hover:bg-muted/30">
                  <TableCell className="border-r">{formatDate(row.created_at_date)}</TableCell>
                  <TableCell className="border-r">{getOrgName(row.facility_id)}</TableCell>
                  <TableCell className="border-r text-sm">{row.payer_name}</TableCell>
                  <TableCell className="font-semibold border-r">{formatNumber(row.total_orders_loaded)}</TableCell>
                  <TableCell className="font-semibold border-r">{formatNumber(row.total_orders_billed)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.loaded_0_to_7)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.loaded_8_to_14)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.loaded_15_to_21)}</TableCell>
                  <TableCell className="text-center border-r">{formatNumber(row.loaded_21_plus)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.billed_0_to_7)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.billed_8_to_14)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.billed_15_to_21)}</TableCell>
                  <TableCell className="text-center">{formatNumber(row.billed_21_plus)}</TableCell>
                </TableRow>
              ))}

              {/* TOTAL row */}
              <TableRow className="bg-yellow-100 hover:bg-yellow-200 border-t-2">
                <TableCell className="font-bold border-r">TOTAL</TableCell>
                <TableCell className="font-bold border-r" />
                <TableCell className="font-bold border-r" />
                <TableCell className="font-bold border-r">{formatNumber(totals.total_orders_loaded)}</TableCell>
                <TableCell className="font-bold border-r">{formatNumber(totals.total_orders_billed)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.loaded_0_to_7)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.loaded_8_to_14)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.loaded_15_to_21)}</TableCell>
                <TableCell className="font-bold text-center border-r">{formatNumber(totals.loaded_21_plus)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.billed_0_to_7)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.billed_8_to_14)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.billed_15_to_21)}</TableCell>
                <TableCell className="font-bold text-center">{formatNumber(totals.billed_21_plus)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
