/**
 * Metrics Validation Alert Component
 * Displays validation status for business metrics data integrity
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { StatusBreakdown } from '@/types/business';

interface MetricsValidationAlertProps {
  validation: StatusBreakdown;
}

export function MetricsValidationAlert({ validation }: MetricsValidationAlertProps) {
  if (validation.validationMatch) {
    return (
      <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-green-800 font-semibold">Data Validation Passed</p>
          <p className="text-green-700 text-sm mt-1">
            Total Orders Worked ({validation.totalOrdersWorked.toLocaleString()}) matches the sum
            of all status fields ({validation.sumOfStatuses.toLocaleString()})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-red-800 font-semibold">Data Validation Failed</p>
        <p className="text-red-700 text-sm mt-1">
          Total Orders Worked ({validation.totalOrdersWorked.toLocaleString()}) does not match the
          sum of all status fields ({validation.sumOfStatuses.toLocaleString()})
        </p>
        <p className="text-red-600 text-xs mt-2">
          Discrepancy: {validation.discrepancy > 0 ? '+' : ''}
          {validation.discrepancy.toLocaleString()} orders
        </p>
        <p className="text-red-600 text-xs mt-1">
          This may indicate a data sync issue. Try refreshing the data or contact support if the
          issue persists.
        </p>
      </div>
    </div>
  );
}
