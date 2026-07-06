import type { BillingClient } from '@/types/billingAnalytics';

interface BillingClientSelectorProps {
  clients: BillingClient[];
  selectedFacilityId: string;
  onChange: (facilityId: string) => void;
}

export function BillingClientSelector({
  clients,
  selectedFacilityId,
  onChange,
}: BillingClientSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium whitespace-nowrap">Client:</label>
      <select
        value={selectedFacilityId}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[140px]"
      >
        {clients.length === 0 && (
          <option value="">Loading...</option>
        )}
        {clients.map((client) => (
          <option key={client.facilityId} value={client.facilityId}>
            {client.orgName}
          </option>
        ))}
      </select>
    </div>
  );
}
