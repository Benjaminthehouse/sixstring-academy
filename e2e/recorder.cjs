#!/usr/bin/env node
/**
 * Browser check of the Recorder (`#record`), with Chromium's fake microphone playing a WAV.
 *
 *   node e2e/recorder.cjs            # everything
 *   node e2e/recorder.cjs --only desktop,phone,artifact,unsupported,denied
 *
 * desktop      count-in then record a take (live meter moves), it is stored in IndexedDB with a real
 *              length and waveform, plays back (position moves), seeks by tapping the waveform,
 *              Space pauses; a second take without count-in (options sheet); A/B compare; rename;
 *              delete + Undo; delete for good; reload keeps the takes; save as a file; leaving
 *              mid-take still stores it; #record--<label> names the take.
 * phone        the Record button sits in the bottom dock; record, play, no sideways scroll.
 * artifact     inside a Claude artifact the microphone is refused: MediaBlocked, no Record button,
 *              the takes list still renders.
 * unsupported  no MediaRecorder: the screen says so instead of offering Record.
 * denied       no microphone permission: pressing Record shows the MediaBlocked panel and recovers.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withApp } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = new Set(onlyArg ? onlyArg.split(',') : []);
const want = (name) => only.size === 0 || only.has(name);

let failures = 0;
function check(cond, message) {
  if (cond) console.log(`  ok   ${message}`);
  else {
    failures++;
    console.log(`  FAIL ${message}`);
  }
}

// ---------------------------------------------------------------------------------------------
// The fake microphone: four plucked notes (A3 C#4 E4 A4), a second each, looped by Chromium.
// ---------------------------------------------------------------------------------------------

function makeWav() {
  const sr = 48000;
  const notes = [57, 61, 64, 69];
  const n = sr * notes.length;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + n * 2, 4);
  pcm.write('WAVE', 8);
  pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24);
  pcm.writeUInt32LE(sr * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const note = notes[Math.floor(i / sr)];
    const t = (i % sr) / sr;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const env = Math.exp(-3 * t) * Math.min(1, t * 400);
    const v = 0.45 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-e2e-'));
  const file = path.join(dir, 'notes.wav');
  fs.writeFileSync(file, pcm);
  return file;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const root = '[data-recorder]';
const attr = (page, name) => page.$eval(root, (el, n) => el.getAttribute(n), name);

async function waitAttr(page, name, value, timeout = 15000) {
  await page.waitForFunction(
    ([sel, n, v]) => {
      const el = document.querySelector(sel);
      return !!el && el.getAttribute(n) === v;
    },
    [root, name, value],
    { timeout },
  );
}

async function waitTakes(page, n, timeout = 20000) {
  await waitAttr(page, 'data-takes', String(n), timeout);
}

/** The takes as stored in IndexedDB (the recorder's own database until the platform blob store is used). */
async function storedTakes(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('ssa-recorder');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('blobs')) return resolve(null);
          const get = db.transaction('blobs').objectStore('blobs').get('takes.json');
          get.onsuccess = async () => {
            const blob = get.result;
            if (!blob) return resolve([]);
            const list = JSON.parse(await blob.text());
            const sizes = [];
            for (const t of list) {
              const a = await new Promise((r) => {
                const g = db.transaction('blobs').objectStore('blobs').get(`take/${t.id}`);
                g.onsuccess = () => r(g.result);
                g.onerror = () => r(null);
              });
              sizes.push(a ? a.size : 0);
            }
            db.close();
            resolve(list.map((t, i) => ({ ...t, audioBytes: sizes[i] })));
          };
          get.onerror = () => resolve(null);
        };
      }),
  );
}

/** Take keyboard focus off whatever has it, so R and Space reach the screen. */
async function blur(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

async function moreAction(page, label) {
  await page.click('[data-recorder-more]');
  await page.getByRole('menuitem', { name: new RegExp(label) }).first().click();
}

/** Record one take: press R (or click), wait until it is really recording, record `seconds`, stop. */
async function recordTake(page, seconds, { useKey = true } = {}) {
  await blur(page);
  if (useKey) await page.keyboard.press('r');
  else await page.click('[data-recorder-record]');
  await waitAttr(page, 'data-phase', 'recording', 15000);
  await page.waitForTimeout(seconds * 1000);
  if (useKey) await page.keyboard.press('r');
  else await page.click('[data-recorder-record]');
  await waitAttr(page, 'data-phase', 'idle', 20000);
}

// ---------------------------------------------------------------------------------------------
// Desktop: the whole flow
// ---------------------------------------------------------------------------------------------

async function desktop(wav) {
  console.log('desktop');
  await withApp({ fakeAudio: wav, settle: 300 }, async ({ page, goto, errors }) => {
    await goto('record');
    await waitTakes(page, 0);
    check((await attr(page, 'data-support')) === 'ok', 'the browser can record');
    check((await attr(page, 'data-backend')) === 'indexeddb', 'takes are kept in IndexedDB');
    check(await page.getByText('No takes yet').isVisible(), 'an empty takes list explains what to do');
    check(await page.getByText('Takes stay on this device only').isVisible(), 'the screen says takes are device-only');
    check((await page.getByLabel('Name of the next take').inputValue()) === 'Take 1', 'the first take is called "Take 1"');

    // 1. A counted-in take.
    await blur(page);
    await page.keyboard.press('r');
    await waitAttr(page, 'data-phase', 'counting', 10000);
    check(true, 'R starts the count-in');
    const counted = await page.waitForFunction(() => /^[1-6]$/.test(document.querySelector('[data-recorder-clock]')?.textContent?.trim() ?? ''), null, { timeout: 8000 }).then(() => true, () => false);
    check(counted, 'the count-in shows the beats left');
    await waitAttr(page, 'data-phase', 'recording', 15000);
    check(true, 'recording starts after one bar');
    const heard = await page.waitForFunction(() => ['good', 'quiet', 'loud'].includes(document.querySelector('[data-recorder-verdict]')?.getAttribute('data-recorder-verdict') ?? ''), null, { timeout: 8000 }).then(() => true, () => false);
    check(heard, 'the level meter reacts to the microphone');
    await page.waitForTimeout(2500);
    const clock = await page.textContent('[data-recorder-clock]');
    check(/^0:0[1-9]$/.test(clock.trim()), `the clock runs while recording (${clock.trim()})`);
    await page.keyboard.press('r');
    await waitTakes(page, 1);
    check(await page.getByText('Saved “Take 1”').first().isVisible().catch(() => false), 'a toast says the take was saved');

    let stored = await storedTakes(page);
    check(Array.isArray(stored) && stored.length === 1, 'one take in IndexedDB');
    const first = stored[0];
    check(first.durationMs > 1500 && first.durationMs < 5000, `its length is the recorded time (${first.durationMs} ms)`);
    check(first.audioBytes > 2000 && first.audioBytes === first.bytes, `its audio is stored (${first.audioBytes} bytes)`);
    check(/^audio\//.test(first.mimeType), `in a recorded format (${first.mimeType})`);
    check(Math.max(...first.peaks) > 0.05, 'its waveform has the notes in it');
    check(first.bpm === 80, 'it remembers the count-in tempo');
    check((await attr(page, 'data-selected')) === first.id, 'the new take is selected');

    // 2. Play it back, seek, pause.
    await page.waitForSelector('[data-recorder-player][data-load="ready"]', { timeout: 15000 });
    const duration = Number(await page.getAttribute('[data-recorder-wave]', 'data-duration'));
    check(duration > 1.5 && duration < 5, `the player knows the exact length (${duration.toFixed(2)} s)`);
    await page.click('[data-recorder-play]');
    await waitAttr(page, 'data-playing', 'true', 5000);
    check(true, 'Play starts playback');
    await page.waitForTimeout(1300);
    const now = Number(await page.getAttribute('[data-recorder-wave]', 'aria-valuenow'));
    check(now >= 1, `the playhead moves (${now} s)`);
    const box = await page.locator('[data-recorder-wave]').boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.waitForTimeout(150);
    const pos = await page.evaluate(() => Number(document.querySelector('[data-recorder-wave]').getAttribute('aria-valuenow')));
    check(Math.abs(pos - duration / 2) <= 1, `tapping the middle of the waveform seeks there (${pos} s of ${duration.toFixed(1)})`);
    await blur(page);
    await page.keyboard.press(' ');
    await page.waitForFunction(() => !document.querySelector('[data-recorder]')?.hasAttribute('data-playing'), null, { timeout: 5000 });
    check(true, 'Space pauses');
    await page.keyboard.press(' ');
    await waitAttr(page, 'data-playing', 'true', 5000);
    check(true, 'Space plays again');
    await page.waitForFunction(() => !document.querySelector('[data-recorder]')?.hasAttribute('data-playing'), null, { timeout: 10000 });
    check(true, 'playback stops at the end');

    // 3. Options: no count-in. A second take starts at once.
    await page.click('[data-recorder-options-open]');
    await page.waitForSelector('[data-recorder-options]');
    await page.getByRole('switch', { name: /Count me in/ }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(300);
    check((await page.textContent('[data-recorder-options-open]')).includes('Starts at once'), 'the options button says how a take starts');
    check((await page.getByLabel('Name of the next take').inputValue()) === 'Take 2', 'the next take is called "Take 2"');
    const t0 = Date.now();
    await recordTake(page, 1.5, { useKey: false });
    await waitTakes(page, 2);
    check(Date.now() - t0 < 12000, 'without a count-in the take starts at once');
    stored = await storedTakes(page);
    check(stored.some((t) => t.name === 'Take 2' && t.bpm === null), 'the second take has no tempo');

    // 4. Compare A and B.
    await page.waitForSelector('[data-recorder-compare-open]');
    await page.click('[data-recorder-compare-open]');
    await page.waitForSelector('[data-recorder-compare]');
    await page.waitForFunction(() => !document.querySelector('[data-recorder-compare-play]')?.hasAttribute('disabled'), null, { timeout: 15000 });
    await page.click('[data-recorder-compare-play]');
    await page.waitForFunction(() => /Pause/.test(document.querySelector('[data-recorder-compare-play]')?.textContent ?? ''), null, { timeout: 5000 });
    check(true, 'the comparison plays');
    await page.keyboard.press('b');
    await page.waitForSelector('[data-recorder-compare][data-side="b"]', { timeout: 3000 });
    check(true, 'B switches to the other take');
    check(/Pause/.test(await page.textContent('[data-recorder-compare-play]')), 'and it keeps playing');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-recorder-compare]', { state: 'detached', timeout: 5000 });

    // 5. Rename.
    await moreAction(page, 'Rename');
    const field = page.getByRole('dialog').getByLabel('Name');
    await field.fill('My best take');
    await page.click('[data-recorder-rename-save]');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-recorder-takes] li')].some((li) => li.textContent.includes('My best take')), null, { timeout: 5000 });
    check(true, 'a take can be renamed');

    // 6. Delete, undo, delete for good.
    await moreAction(page, 'Delete');
    await waitTakes(page, 1);
    check(true, 'Delete removes the take');
    await page.getByRole('button', { name: 'Undo' }).click();
    await waitTakes(page, 2);
    check(true, 'Undo brings it back');
    stored = await storedTakes(page);
    check(stored.length === 2 && stored.every((t) => t.audioBytes > 0), 'with its audio');
    await moreAction(page, 'Delete');
    await waitTakes(page, 1);
    stored = await storedTakes(page);
    check(stored.length === 1, 'deleted for good once the Undo is not used');

    // 7. Save as a file.
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), moreAction(page, 'Save as a file')]);
    const name = download.suggestedFilename();
    const tmp = path.join(os.tmpdir(), `rec-${Date.now()}-${name}`);
    await download.saveAs(tmp);
    check(/^take-1-\d{4}-\d{2}-\d{2}\.(webm|ogg|m4a)$/.test(name) && fs.statSync(tmp).size > 2000, `a take saves as a file (${name}, ${fs.statSync(tmp).size} bytes)`);

    // 8. The takes are still there after a reload.
    await page.reload();
    await page.waitForSelector(root);
    await waitTakes(page, 1);
    check(true, 'takes survive a reload');

    // 9. Leaving mid-take keeps the take.
    await blur(page);
    await page.keyboard.press('r');
    await waitAttr(page, 'data-phase', 'recording', 15000);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      location.hash = '#tuner';
    });
    await page.waitForSelector('main[data-route="tuner"]');
    const kept = await page.waitForFunction(() => /Saved your take/.test(document.body.textContent ?? ''), null, { timeout: 15000 }).then(() => true, () => false);
    check(kept, 'leaving mid-take saves it and says where');
    await page.evaluate(() => {
      location.hash = '#record';
    });
    await page.waitForSelector(root);
    await waitTakes(page, 2);
    check(true, 'the take recorded before leaving is in the list');

    // 10. A teacher's task names the take.
    await goto('record', 'week-1-first-section');
    await waitTakes(page, 2);
    check((await page.getByLabel('Name of the next take').inputValue()) === 'Week 1 first section', '#record--week-1-first-section names the take');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, 'no sideways scroll');
    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  });
}

// ---------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------

async function phone(wav) {
  console.log('phone');
  await withApp({ mobile: true, fakeAudio: wav, settle: 300 }, async ({ page, goto, errors }) => {
    // Start without a count-in, as a learner who switched it off.
    await page.addInitScript(() => localStorage.setItem('ssa:recorder.prefs', JSON.stringify({ countIn: false, click: false, bpm: 80, beats: 4 })));
    await goto('record');
    await waitTakes(page, 0);
    const dock = await page.$('[data-ui-action-bar] [data-recorder-record]');
    check(!!dock, 'the Record button sits in the bottom bar');
    const b = await page.locator('[data-recorder-record]').boundingBox();
    const vh = page.viewportSize().height;
    check(b && b.y > vh / 2 && b.y + b.height <= vh, 'in the thumb zone, on screen');
    check(b && b.width >= 44 && b.height >= 44, 'and big enough to hit');
    await page.tap('[data-recorder-record]');
    await waitAttr(page, 'data-phase', 'recording', 15000);
    await page.waitForTimeout(1500);
    await page.tap('[data-recorder-record]');
    await waitTakes(page, 1);
    check(true, 'a take is recorded with taps');
    await page.waitForSelector('[data-recorder-player][data-load="ready"]', { timeout: 15000 });
    await page.tap('[data-recorder-play]');
    await waitAttr(page, 'data-playing', 'true', 5000);
    check(true, 'and plays back');
    await page.tap('[data-recorder-play]');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, 'no sideways scroll at 390 px');
    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  });
}

// ---------------------------------------------------------------------------------------------
// Hosts and browsers that cannot record
// ---------------------------------------------------------------------------------------------

async function artifact() {
  console.log('artifact');
  await withApp({ mobile: true, settle: 300 }, async ({ page, goto, errors }) => {
    // What the Claude viewer gives a page: a `window.claude` runtime, and no microphone.
    await page.addInitScript(() => {
      window.claude = { use: async () => null };
    });
    await goto('record');
    await waitTakes(page, 0);
    check((await attr(page, 'data-support')) === 'media', 'the recorder knows the host refuses the microphone');
    check(await page.getByText('The microphone is switched off in this viewer').isVisible(), 'MediaBlocked explains it in the standard words');
    check((await page.$('[data-recorder-record]')) === null, 'no Record button that cannot work');
    check(await page.getByText('No takes on this device').isVisible(), 'the takes list still renders');
    check(await page.getByText('What to listen for').isVisible(), 'the listening checklist is still there');
    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  });
}

async function unsupported() {
  console.log('unsupported');
  await withApp({ settle: 300 }, async ({ page, goto, errors }) => {
    await page.addInitScript(() => {
      delete window.MediaRecorder;
    });
    await goto('record');
    await waitTakes(page, 0);
    check((await attr(page, 'data-support')) === 'recorder', 'a browser without MediaRecorder is recognised');
    check(await page.getByText('This browser cannot record audio').isVisible(), 'and told so plainly');
    check((await page.$('[data-recorder-record]')) === null, 'no Record button');
    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  });
}

async function denied() {
  console.log('denied');
  await withApp({ settle: 300 }, async ({ page, goto, errors }) => {
    await page.addInitScript(() => {
      // A browser where the person says no.
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    });
    await goto('record');
    await waitTakes(page, 0);
    await page.click('[data-recorder-record]');
    const shown = await page.waitForSelector('[data-recorder-deck] [role="alert"]', { timeout: 8000 }).then(() => true, () => false);
    check(shown, 'a refused microphone shows the MediaBlocked panel');
    check(await page.getByText('Permission to use the microphone was declined').isVisible(), 'with the standard explanation');
    check(await page.getByRole('button', { name: 'Try again' }).isVisible(), 'and a way to try again');
    check((await attr(page, 'data-phase')) === 'idle', 'the recorder is back to idle');
    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  });
}

(async () => {
  const wav = makeWav();
  if (want('desktop')) await desktop(wav);
  if (want('phone')) await phone(wav);
  if (want('artifact')) await artifact();
  if (want('unsupported')) await unsupported();
  if (want('denied')) await denied();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall recorder checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
