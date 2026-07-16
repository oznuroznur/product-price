// chrome.storage.local üzerinde TTL'li cache. Storage enjekte edilebilir → Node'da test edilir.
export const DEFAULT_TTL_MS = 45 * 60 * 1000; // spec §5: 45 dakika

export function createCache({ storage, ttlMs = DEFAULT_TTL_MS, now = Date.now }) {
  return {
    async get(key) {
      const wrapped = (await storage.get(key))[key];
      if (!wrapped) return null;
      if (now() - wrapped.fetchedAt > ttlMs) {
        await storage.remove(key);
        return null;
      }
      return wrapped;
    },
    async set(key, data) {
      const wrapped = { ...data, fetchedAt: now() };
      await storage.set({ [key]: wrapped });
      return wrapped;
    },
  };
}
