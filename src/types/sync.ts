export interface SyncLogEntry {
  facility_id: string;
  date: string;
  sync_start_timestamp: string;
  sync_end_timestamp: string;
  status: 'in_progress' | 'completed' | 'failed';
  error_message?: string;
  records_synced: number;
}

export interface SyncTriggerResponse {
  success: boolean;
  message: string;
  cooldownUntil?: string;
  error?: string;
}

export interface SyncStatusResponse {
  lastSyncTimestamp: string | null;
  cooldownRemaining: number;
  isInProgress: boolean;
  error?: string;
}
