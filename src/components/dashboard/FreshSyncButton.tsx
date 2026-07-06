import { RefreshCcw, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFreshSync } from '@/hooks/useFreshSync';
import { formatDistanceToNow } from 'date-fns';

interface FreshSyncButtonProps {
  facilityId: string;
  date: string;
  onSyncComplete: () => void;
}

export function FreshSyncButton({ facilityId, date, onSyncComplete }: FreshSyncButtonProps) {
  const { lastSyncTime, cooldownRemaining, isSyncing, canSync, error, triggerSync } = useFreshSync(
    facilityId,
    date,
    onSyncComplete
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        onClick={triggerSync}
        disabled={!canSync || isSyncing}
        variant="default"
        size="sm"
      >
        {isSyncing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : cooldownRemaining > 0 ? (
          <>
            <Clock className="mr-2 h-4 w-4" />
            Wait {cooldownRemaining}m
          </>
        ) : (
          <>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Fresh Sync
          </>
        )}
      </Button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
