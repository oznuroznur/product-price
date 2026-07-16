import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../extension/background/cache.js";

function fakeStorage() {
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (obj) => Object.assign(data, obj),
    remove: async (key) => delete data[key],
  };
}

test("set fetchedAt damgası basar, get aynı veriyi döner", async () => {
  const storage = fakeStorage();
  let t = 1000;
  const cache = createCache({ storage, ttlMs: 100, now: () => t });
  await cache.set("k", { offers: [1, 2] });
  const hit = await cache.get("k");
  assert.deepEqual(hit.offers, [1, 2]);
  assert.equal(hit.fetchedAt, 1000);
});

test("TTL dolunca get null döner ve kaydı siler", async () => {
  const storage = fakeStorage();
  let t = 1000;
  const cache = createCache({ storage, ttlMs: 100, now: () => t });
  await cache.set("k", { offers: [] });
  t = 1101; // 101 ms geçti > 100 ms TTL
  assert.equal(await cache.get("k"), null);
  assert.equal("k" in storage.data, false);
});

test("olmayan anahtar null döner", async () => {
  const cache = createCache({ storage: fakeStorage() });
  assert.equal(await cache.get("yok"), null);
});
