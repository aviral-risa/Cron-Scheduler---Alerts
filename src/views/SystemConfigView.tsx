import { Settings } from 'lucide-react';
import { CronJobsTable } from '@/components/system-config/CronJobsTable';
import { SlackAlertsTable } from '@/components/system-config/SlackAlertsTable';

export function SystemConfigView() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">System Configuration</h1>
          <p className="text-sm text-muted-foreground">
            View scheduled jobs and alert configurations
          </p>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <h3 className="text-sm font-semibold mb-2">Data Pipeline Overview</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Algolia API</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">data-source.ts</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">sync.ts</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">Google Sheets</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Orders are fetched from Algolia, transformed, and stored in Google Sheets.
          Metrics are calculated and stored in separate sheets (org, person, business, EV).
        </p>
      </div>

      {/* Cron Jobs Table */}
      <CronJobsTable />

      {/* Slack Alerts Table */}
      <SlackAlertsTable />

      {/* Footer Info */}
      <div className="text-xs text-muted-foreground p-4 bg-muted/20 rounded-lg">
        <p><strong>Note:</strong> This view is read-only. To modify schedules or alert configurations:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>Cron schedules: Edit <code className="px-1 bg-muted rounded">src/config/cron-schedules.ts</code></li>
          <li>Alert registry: Edit <code className="px-1 bg-muted rounded">src/alerts/config/alert-registry.ts</code></li>
          <li>Feature flags: Edit <code className="px-1 bg-muted rounded">src/config/features.ts</code></li>
        </ul>
      </div>
    </div>
  );
}
