import { useState, useEffect, useCallback, useRef } from 'react';
import { triggerFreshSync, checkSyncStatus } from '../services/dashboardApi';

interface UseFreshSyncResult {
  lastSyncTime: string | null;
  cooldownRemaining: number;
  isSyncing: boolean;
  canSync: boolean;
  error: string | null;
  triggerSync: () => Promise<void>;
}

export function useFreshSync(
  facilityId: string,
  date: string,
  onSyncComplete: () => void
): UseFreshSyncResult {
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousSyncingRef = useRef<boolean>(false);

  // Reset state when facilityId or date changes
  useEffect(() => {
    setError(null);
    setIsSyncing(false);
    setCooldownRemaining(0);
    setLastSyncTime(null);
    previousSyncingRef.current = false;
  }, [facilityId, date]);

  // Check initial sync status on mount and when facility/date changes
  const checkStatus = useCallback(async () => {
    try {
      const status = await checkSyncStatus(facilityId, date);
      setLastSyncTime(status.lastSyncTimestamp);
      setCooldownRemaining(status.cooldownRemaining);

      // If sync just completed, trigger callback
      if (!status.isInProgress && previousSyncingRef.current) {
        onSyncComplete();
      }

      previousSyncingRef.current = status.isInProgress;
      setIsSyncing(status.isInProgress);

      if (status.error) {
        setError(status.error);
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('Error checking sync status:', err);
      setError('Failed to check sync status');
    }
  }, [facilityId, date, onSyncComplete]);

  // Initial status check on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Poll for sync status while syncing
  useEffect(() => {
    if (isSyncing) {
      // Poll every 5 seconds
      pollIntervalRef.current = setInterval(() => {
        checkStatus();
      }, 5000);
    } else {
      // Clear polling when not syncing
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isSyncing, checkStatus]);

  // Update cooldown timer every 30 seconds when cooldown is active
  useEffect(() => {
    if (cooldownRemaining > 0 && !isSyncing) {
      cooldownIntervalRef.current = setInterval(() => {
        checkStatus();
      }, 30000); // Update every 30 seconds
    } else {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [cooldownRemaining, isSyncing, checkStatus]);

  const triggerSync = useCallback(async () => {
    try {
      setError(null);
      setIsSyncing(true);

      const result = await triggerFreshSync(facilityId, date);

      if (!result.success) {
        setError(result.error || 'Failed to trigger sync');
        setIsSyncing(false);
      }

      // Start polling for status updates
      checkStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to trigger sync';
      setError(errorMessage);
      setIsSyncing(false);
    }
  }, [facilityId, date, checkStatus]);

  const canSync = !isSyncing && cooldownRemaining === 0;

  return {
    lastSyncTime,
    cooldownRemaining,
    isSyncing,
    canSync,
    error,
    triggerSync,
  };
}
