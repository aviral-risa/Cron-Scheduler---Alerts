import { MessageSquare, Clock, Filter, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ALERT_REGISTRY, type AlertMetadata } from '@/alerts/config/alert-registry';

const categoryColors: Record<AlertMetadata['category'], string> = {
  performance: 'text-green-600 bg-green-50',
  queue: 'text-blue-600 bg-blue-50',
  tracking: 'text-amber-600 bg-amber-50',
  funnel: 'text-purple-600 bg-purple-50',
  daily: 'text-indigo-600 bg-indigo-50',
};

const categoryLabels: Record<AlertMetadata['category'], string> = {
  performance: 'Performance',
  queue: 'Queue',
  tracking: 'Tracking',
  funnel: 'Funnel',
  daily: 'Daily',
};

function CategoryBadge({ category }: { category: AlertMetadata['category'] }) {
  const colorClass = categoryColors[category];
  const label = categoryLabels[category];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

function FeatureBadge({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
      {label}
    </span>
  );
}

export function SlackAlertsTable() {
  // Group alerts by category
  const categories = ['performance', 'queue', 'tracking', 'funnel', 'daily'] as const;
  const alertsByCategory = categories.map((cat) => ({
    category: cat,
    alerts: ALERT_REGISTRY.filter((a) => a.category === cat),
  }));

  // Calculate stats
  const totalAlerts = ALERT_REGISTRY.length;
  const enabledAlerts = ALERT_REGISTRY.filter((a) => a.enabled).length;
  const scheduledAlerts = ALERT_REGISTRY.filter((a) => a.schedule).length;
  const manualAlerts = ALERT_REGISTRY.filter((a) => !a.schedule).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Slack Alert Configurations
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Available Slack alerts that can be triggered manually or on schedule.
          Run with: <code className="px-1.5 py-0.5 bg-muted rounded text-xs">npm run alert:&lt;id&gt;</code>
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Alert Name</TableHead>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Schedule</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="w-[140px]">Features</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertsByCategory.map(({ category, alerts }) => (
                <>
                  {alerts.length > 0 && (
                    <TableRow key={`header-${category}`} className="bg-muted/30">
                      <TableCell colSpan={7} className="py-2">
                        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                          <CategoryBadge category={category} />
                          <span>({alerts.length} alerts)</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">{alert.name}</TableCell>
                      <TableCell>
                        <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{alert.id}</code>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs">
                        {alert.description}
                      </TableCell>
                      <TableCell>
                        {alert.schedule ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3 text-blue-500" />
                            <code className="px-1 py-0.5 bg-blue-50 rounded">{alert.schedule}</code>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <CategoryBadge category={alert.category} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <FeatureBadge label="Org Filter" active={alert.supportsOrgFilter} />
                          <FeatureBadge label="Preview" active={alert.supportsPreview} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge enabled={alert.enabled} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total Alerts</p>
              <p className="text-lg font-semibold">{totalAlerts}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
            <Zap className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Enabled</p>
              <p className="text-lg font-semibold text-green-600">{enabledAlerts}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
            <Clock className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="text-lg font-semibold text-blue-600">{scheduledAlerts}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Manual Only</p>
              <p className="text-lg font-semibold">{manualAlerts}</p>
            </div>
          </div>
        </div>

        {/* Usage Examples */}
        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Quick Commands</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <code className="p-2 bg-background rounded border">npm run alert:queue</code>
            <code className="p-2 bg-background rounded border">npm run alert:performance</code>
            <code className="p-2 bg-background rounded border">npm run alert:denial</code>
            <code className="p-2 bg-background rounded border">npm run alert:list</code>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
