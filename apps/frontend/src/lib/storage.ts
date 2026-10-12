/**
 * Safe Browser Storage Utility
 * Fully compatible with Mobile Safari Private Browsing mode and restricted in-app webviews.
 * Gracefully falls back to in-memory store if DOMException / SecurityError is thrown.
 */

const memorySessionStore = new Map<string, string>();
const memoryLocalStore = new Map<string, string>();

export const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch {
      // Insecure context / Mobile Safari Private Browsing SecurityError
    }
    return memorySessionStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch {
      // Insecure context / Mobile Safari Private Browsing SecurityError
    }
    memorySessionStore.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {}
    memorySessionStore.delete(key);
  },
};

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Insecure context / Mobile Safari Private Browsing SecurityError
    }
    return memoryLocalStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Insecure context / Mobile Safari Private Browsing SecurityError
    }
    memoryLocalStore.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    memoryLocalStore.delete(key);
  },
};
