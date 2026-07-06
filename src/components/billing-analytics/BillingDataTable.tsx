import { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { BillingDataRow } from '@/types/billingAnalytics';

interface BillingDataTableProps {
  data: BillingDataRow[];
  loading: boolean;
}

type SortDir = 'asc' | 'desc';

const COLUMNS: { key: keyof BillingDataRow; label: string }[] = [
  { key: 'date_of_work', label: 'Date of Work' },
  { key: 'mrn', label: 'MRN' },
  { key: 'patient_name', label: 'Patient' },
  { key: 'md', label: 'MD' },
  { key: 'primary_insurance', label: 'Insurance' },
  { key: 'regimen', label: 'Regimen' },
  { key: 'auth_status', label: 'Auth Status' },
  { key: 'bo_value', label: 'BO Value' },
  { key: 'date_of_service', label: 'DoS' },
  { key: 'location', label: 'Location' },
];

function formatDate(val: string | null): string {
  if (!val) return '-';
  // Parse "2025-07-14T00:00:00" → "07/14/2025"
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function cellValue(row: BillingDataRow, key: keyof BillingDataRow): string {
  const val = row[key];
  if (val == null || val === '') return '-';
  if (key === 'date_of_work' || key === 'date_of_service' || key === 'dob' || key === 'order_creation_date') {
    return formatDate(val as string);
  }
  return String(val);
}

export function BillingDataTable({ data, loading }: BillingDataTableProps) {
  const [sortKey, setSortKey] = useState<keyof BillingDataRow>('date_of_work');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: keyof BillingDataRow) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full mb-2" />
        ))}
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No billing data found for the selected filters.
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Billing Data ({data.length.toLocaleString()} rows)
        </h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className="cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, idx) => (
            <TableRow key={`${row.id}-${idx}`}>
              {COLUMNS.map((col) => (
                <TableCell key={col.key} className="whitespace-nowrap text-xs">
                  {cellValue(row, col.key)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
