import type { BillingDataset } from '@/config/billing-sources.config';

interface BillingDatasetToggleProps {
  dataset: BillingDataset;
  availableDatasets: string[];
  onChange: (dataset: BillingDataset) => void;
}

const DATASET_LABELS: Record<string, string> = {
  medical_pa_final_worklist: 'Manual (Vetted)',
  external_dashboard: 'Automated',
};

export function BillingDatasetToggle({
  dataset,
  availableDatasets,
  onChange,
}: BillingDatasetToggleProps) {
  if (availableDatasets.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium whitespace-nowrap">Source:</label>
      <div className="flex rounded-md border border-input overflow-hidden">
        {availableDatasets.map((ds) => (
          <button
            key={ds}
            onClick={() => onChange(ds as BillingDataset)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              dataset === ds
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            {DATASET_LABELS[ds] ?? ds}
          </button>
        ))}
      </div>
    </div>
  );
}
