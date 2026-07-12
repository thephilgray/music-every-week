/**
 * Safe localStorage utility and automatic legacy storage cleanup.
 * Prevents QuotaExceededError crashes and cleans up legacy GunDB / radata keys.
 */

export function cleanupLegacyStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Clean up legacy GunDB / radata keys that consume large amounts of localStorage quota
      if (
        key === 'mew-radata-v1' ||
        key === 'radata' ||
        key.startsWith('mew-radata') ||
        key.startsWith('radata') ||
        key.startsWith('gun/') ||
        key.startsWith('gun') ||
        key.startsWith('mew_gun_')
      ) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      console.info(`Cleaning up ${keysToRemove.length} legacy storage keys (${keysToRemove.join(', ')})...`);
      keysToRemove.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
    }
  } catch (err) {
    console.warn('Failed to clean up legacy storage:', err);
  }
}

/**
 * Safely set a localStorage item, catching QuotaExceededError or security errors.
 * Automatically attempts cleanup of legacy keys and non-critical queue data if quota is reached.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    // Attempt recovery on QuotaExceededError
    try {
      // 1. First run legacy storage cleanup
      cleanupLegacyStorage();
      localStorage.setItem(key, value);
      return true;
    } catch {
      // 2. If still full and key is not player_queue, remove non-critical player_queue to free up space
      if (key !== 'player_queue') {
        try {
          localStorage.removeItem('player_queue');
          localStorage.setItem(key, value);
          return true;
        } catch (finalErr) {
          console.warn(`Failed to set localStorage item "${key}" even after recovery attempts:`, finalErr);
          return false;
        }
      }
      console.warn(`Failed to set localStorage item "${key}": quota exceeded.`);
      return false;
    }
  }
}

/**
 * Safely get a localStorage item without throwing errors.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safely remove a localStorage item without throwing errors.
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}
