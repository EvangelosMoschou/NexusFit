import { vi } from "vitest";

// Installs a minimal in-memory localStorage + window so browser-storage code can
// be exercised under the default node test environment. Returns the backing Map
// so tests can assert on what was (or was not) written.
export function installBrowserStorage(): Map<string, string> {
  const store = new Map<string, string>();

  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });

  return store;
}
