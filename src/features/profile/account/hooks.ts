import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSyncStatus, restartCloudSync, startCloudSync, subscribeSyncStatus, syncNow, type SyncStatus } from '@/core/platform';
import { getAccounts, getAccountState, subscribeAccount, type AccountState } from '@/core/platform/cloud';
import { toast } from '@/ui';
import type { SyncView } from './model';

/** The account, read once on first use and kept current. */
export function useAccount(): AccountState {
  useEffect(() => {
    void getAccounts().ready();
  }, []);
  return useSyncExternalStore(subscribeAccount, getAccountState, getAccountState);
}

/**
 * The sync status, kept current. Opening the Me area also starts sync if the shell has not (so a
 * copy with accounts syncs once the learner looks here, whatever the shell does at startup).
 */
export function useSyncStatus(): SyncStatus {
  useEffect(() => {
    void startCloudSync();
  }, []);
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

/** The time now, every `ms` while `active` (for "Send a new code in 0:42" and "synced 2 min ago"). */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** The sync row's button: Sync now (write and look), Try again (start afresh). Toasts the outcome. */
export function useSyncAction(): { busy: boolean; run: (action: SyncView['action']) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: SyncView['action']) => {
    if (action !== 'sync-now' && action !== 'retry') return;
    setBusy(true);
    try {
      if (action === 'retry') await restartCloudSync();
      else await syncNow();
      // Give a fresh start a moment to read the cloud before saying how it went.
      if (action === 'retry') await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = getSyncStatus();
      if (after.state === 'synced') toast.ok('Synced');
      else if (after.state === 'offline') toast.info('You are offline', { description: 'Your changes wait on this device and sync when you are back online.' });
      else if (after.state === 'error') toast.warn('Could not sync right now', { description: after.message });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
