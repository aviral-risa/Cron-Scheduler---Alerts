import { Clock, RefreshCw, Bell, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CRON_SCHEDULES, type CronSchedule } from '@/config/cron-schedules';

const categoryIcons = {
  sync: RefreshCw,
  alert: Bell,
  maintenance: Wrench,
};

const categoryLabels = {
  sync: 'Data Sync',
  alert: 'Slack Alerts',
  maintenance: 'Maintenance',
};

const categoryColors = {
  sync: 'text-blue-600 bg-blue-50',
  alert: 'text-amber-600 bg-amber-50',
  maintenance: 'text-purple-600 bg-purple-50',
};

function CategoryBadge({ category }: { category: CronSchedule['category'] }) {
  const Icon = categoryIcons[category];
  const label = categoryLabels[category];
  const colorClass = categoryColors[category];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
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
      {enabled ? 'Active' : 'Disabled'}
    </span>
  );
}

export function CronJobsTable() {
  // Group schedules by category
  const syncJobs = CRON_SCHEDULES.filter((s) => s.category === 'sync');
  const alertJobs = CRON_SCHEDULES.filter((s) => s.category === 'alert');
  const maintenanceJobs = CRON_SCHEDULES.filter((s) => s.category === 'maintenance');

  const renderJobRows = (jobs: CronSchedule[]) =>
    jobs.map((schedule) => (
      <TableRow key={schedule.id}>
        <TableCell className="font-medium">{schedule.name}</TableCell>
        <TableCell>
          <code className="px-2 py-1 bg-muted rounded text-xs">{schedule.cron}</code>
        </TableCell>
        <TableCell className="font-mono text-sm">{schedule.timeIST}</TableCell>
        <TableCell className="text-muted-foreground text-sm max-w-xs">
          {schedule.description}
        </TableCell>
        <TableCell>
          <CategoryBadge category={schedule.category} />
        </TableCell>
        <TableCell>
          <StatusBadge enabled={schedule.enabled} />
        </TableCell>
      </TableRow>
    ));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Scheduled Cron Jobs
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          All jobs run on Asia/Kolkata (IST) timezone. Weekends are automatically skipped.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Job Name</TableHead>
                <TableHead className="w-[120px]">Cron</TableHead>
                <TableHead className="w-[100px]">Time (IST)</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Sync Jobs */}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={6} className="py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <RefreshCw className="h-4 w-4" />
                    Data Sync Jobs ({syncJobs.length})
                  </span>
                </TableCell>
              </TableRow>
              {renderJobRows(syncJobs)}

              {/* Alert Jobs */}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={6} className="py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    Alert Jobs ({alertJobs.length})
                  </span>
                </TableCell>
              </TableRow>
              {renderJobRows(alertJobs)}

              {/* Maintenance Jobs */}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={6} className="py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Wrench className="h-4 w-4" />
                    Maintenance Jobs ({maintenanceJobs.length})
                  </span>
                </TableCell>
              </TableRow>
              {renderJobRows(maintenanceJobs)}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 flex gap-6 text-sm text-muted-foreground">
          <span>Total Jobs: <strong className="text-foreground">{CRON_SCHEDULES.length}</strong></span>
          <span>Active: <strong className="text-green-600">{CRON_SCHEDULES.filter(s => s.enabled).length}</strong></span>
          <span>Disabled: <strong className="text-gray-500">{CRON_SCHEDULES.filter(s => !s.enabled).length}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}
