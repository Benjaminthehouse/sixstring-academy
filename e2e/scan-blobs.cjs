#!/usr/bin/env node
/**
 * Browser check of the platform blob store (`src/core/platform/blobs.ts`) on Chromium's real
 * IndexedDB: put / get / list by prefix / delete / total size, bytes and types kept, a reload in
 * between (the data outlives the page), namespaces apart, a store that falls back to memory when
 * the browser refuses storage, and a full disk reported as "full". Run: node e2e/scan-blobs.cjs
 *
 * The scanner keeps its unsaved draft here and the recorder its takes.
 */
'use strict';
const { chromium } = require('playwright');
const { startServer } = require('./lib/harness.cjs');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== undefined ? `  -- ${JSON.stringify(detail)}` : ''}`);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Any page of the app serves the module through the dev server; no screen is needed.
    await page.goto(server.url + '#scan', { waitUntil: 'load' });
    const load = `import('/src/core/platform/blobs.ts')`;

    const first = await page.evaluate(async (load) => {
      const m = await eval(load);
      const store = await m.openBlobStore('e2e-blobs');
      await store.deletePrefix('');
      const bytes = new Uint8Array(300000);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 255;
      await store.put('take/a', new Blob([bytes], { type: 'audio/wav' }));
      await store.put('take/b', new Blob(['hello'], { type: 'text/plain' }));
      await store.putJSON('takes.json', [{ id: 'a' }, { id: 'b' }]);
      const other = await m.openBlobStore('e2e-blobs-other');
      await other.put('take/a', new Blob(['other']));
      return {
        persistent: store.persistent,
        list: (await store.list('take/')).map((e) => [e.key, e.size, e.type]),
        total: await store.totalSize(),
        otherTotal: await other.totalSize(),
      };
    }, load);
    check('a store opens on IndexedDB (persistent)', first.persistent === true, first);
    check('list by prefix gives keys in order with sizes and types', JSON.stringify(first.list) === JSON.stringify([['take/a', 300000, 'audio/wav'], ['take/b', 5, 'text/plain']]), first.list);
    check('total size counts the store (blobs and JSON) and not the other namespace', first.total === 300000 + 5 + 23 && first.otherTotal === 5, first);

    // A reload: the data outlives the page.
    await page.reload({ waitUntil: 'load' });
    const second = await page.evaluate(async (load) => {
      const m = await eval(load);
      const store = await m.openBlobStore('e2e-blobs');
      const a = await store.get('take/a');
      const buf = new Uint8Array(await a.arrayBuffer());
      let same = buf.length === 300000;
      for (let i = 0; same && i < buf.length; i += 997) same = buf[i] === ((i * 7) & 255);
      const json = await store.getJSON('takes.json', null);
      await store.delete('take/b');
      const afterDelete = (await store.list()).map((e) => e.key);
      const gone = await store.deletePrefix('take/');
      const left = (await store.list()).map((e) => e.key);
      const other = await m.openBlobStore('e2e-blobs-other');
      const otherText = await (await other.get('take/a')).text();
      await store.deletePrefix('');
      await other.deletePrefix('');
      return { type: a.type, same, json, afterDelete, gone, left, otherText, missing: await store.get('nope') };
    }, load);
    check('after a reload the blob comes back byte for byte with its type', second.same && second.type === 'audio/wav', second);
    check('JSON kept beside the blobs reads back', JSON.stringify(second.json) === '[{"id":"a"},{"id":"b"}]', second.json);
    check('delete and deletePrefix forget exactly what they name', JSON.stringify(second.afterDelete) === '["take/a","takes.json"]' && second.gone === 1 && JSON.stringify(second.left) === '["takes.json"]', second);
    check('namespaces stay apart', second.otherText === 'other');
    check('a missing key reads as null', second.missing === null);

    // A browser that refuses IndexedDB: a clear error, or a memory store when asked.
    const refused = await page.evaluate(async (load) => {
      const m = await eval(load);
      const real = window.indexedDB;
      Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
      try {
        const shape = (e) => ({ name: e.name, reason: e.reason, message: e.message });
        // Reading `indexedDB` itself throws (a sandboxed frame): a rejection, never a throw.
        const getter = await m.openBlobDatabase(undefined, 500).then(() => null, shape);
        // open() throws (a private window).
        const fake = { open() { throw new DOMException('The operation is insecure.', 'SecurityError'); } };
        const error = await m.openBlobDatabase(fake, 500).then(() => null, shape);
        return { getter, error };
      } finally {
        Object.defineProperty(window, 'indexedDB', { configurable: true, value: real, writable: true });
      }
    }, load).catch((e) => ({ thrown: String(e) }));
    check('a refusing browser gives a clear "unavailable" error with a sentence', !!refused.error && refused.error.name === 'BlobStoreError' && refused.error.reason === 'unavailable' && /not letting the app keep files/.test(refused.error.message) && !!refused.getter && refused.getter.reason === 'unavailable', refused);

    // A fresh page whose browser refuses IndexedDB from the start: the store a screen opens falls back to memory.
    const blocked = await context.newPage();
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
    await blocked.goto(server.url + '#scan', { waitUntil: 'load' });
    const memory = await blocked.evaluate(async (load) => {
      const m = await eval(load);
      const strict = await m.openBlobStore('e2e-refused').then(() => null, (e) => ({ name: e.name, reason: e.reason }));
      const mem = await m.openBlobStore('e2e-refused', { memoryFallback: true });
      await mem.put('k', new Blob(['abc']));
      return { strict, persistent: mem.persistent, notice: mem.notice, size: await mem.totalSize() };
    }, load);
    check('in a browser that refuses storage, opening a store rejects with "unavailable"', !!memory.strict && memory.strict.reason === 'unavailable', memory);
    check('asked for it, a refused store falls back to memory and says so', memory.persistent === false && /until you close the page/.test(memory.notice) && memory.size === 3, memory);
    await blocked.close();

    const quota = await page.evaluate(async (load) => {
      const m = await eval(load);
      const store = m.createBlobStore('e2e-quota', m.memoryBlobBackend({ quota: 10 }));
      return store.put('x', new Blob(['01234567890'])).then(() => null, (e) => ({ reason: e.reason, message: e.message }));
    }, load);
    check('a full disk is reported as "full" with what to do', quota && quota.reason === 'full' && /Delete things/.test(quota.message), quota);

    check('no page errors', errors.length === 0, errors.slice(0, 3));
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(failures ? `FAILED (${failures})` : 'PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
