#!/usr/bin/env node
/**
 * Browser check of accounts and cross-device sync. Run: node e2e/account.cjs [--verbose] [--no-shots]
 *
 * This machine cannot reach supabase.co, so the check runs a stand-in backend in this process
 * (src/core/platform/cloud/fake.ts: email codes with Supabase's limits, sessions, the sync_docs
 * table with the row-level security of supabase/schema.sql, Realtime) and hands it to each browser
 * context as `window.__ssaCloudFake`, which a development build uses instead of Supabase. Two
 * contexts share it: a phone (390 px, touch) and a desktop (1280 px).
 *
 *  sign-in    the phone signs in from Me > Account with the keyboard: email, Enter, the code
 *             field takes focus; a wrong code is refused kindly; the right one signs in and syncs
 *  phone      the phone finishes a lesson and adds a practice journal entry (through the modules
 *             the screens use) and syncs; nothing secret (the AI key, the session) reaches the cloud
 *  desktop    the desktop signs in with the same email and sees the lesson, the XP and the
 *             journal entry on its own screens
 *  back       the desktop adds an entry and renames the learner; the phone sees both, through
 *             Realtime, without reloading
 *  your-data  the sync row and "Stays on this device" in Your data
 *  offline    the desktop goes offline: the status says so, a change waits, and arrives on the
 *             phone once the desktop is back online
 *  reload     the phone reloads and is still signed in and synced
 *  restart    sync restarts on the phone (what "Try again" does) and a desktop change still
 *             arrives within seconds: the new Realtime channel is not the old one still leaving
 *  sign-out   the desktop signs out keeping its progress; the session is gone from its storage
 *  delete     the phone deletes the cloud data: only the "erased" marker is left, the phone keeps
 *             its progress and says what happened
 *  again      the desktop, signed out before the deletion, signs in again and starts a fresh cloud
 *             copy instead of being signed straight out
 *  limits     a separate backend and a movable browser clock: the resend wait, a code more than an
 *             hour old, and the project's hourly email limit, each in one kind sentence
 *  suggest    a third browser gets the gentle suggestion after three lessons, not before, and
 *             "Not now" hides it for good
 *  layout     the seven parts of Me open cleanly on a phone and a desktop; no sideways scroll on
 *             the phone, at 200 % text too; light and dark screenshots
 *
 * Prints one line per group and exits non-zero if a check failed. On a busy machine, re-run
 * before believing a timeout.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, loadTs, VIEWPORTS, ROOT } = require('./lib/harness.cjs');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const shots = !argv.includes('--no-shots');
const OUT = path.join(ROOT, 'e2e', 'out', 'account');
if (shots) fs.mkdirSync(OUT, { recursive: true });

const EMAIL = 'robin@example.com';
const SECRET = 'sk-ant-api03-ACCOUNT-check-key-never-synced-0123456789abcdef';
const BENIGN = [/favicon\.ico/i, /Download the React DevTools/i];
const T = 45_000; // generous waits: the machine is shared

const results = [];
function check(group, name, pass, detail = '') {
  results.push({ group, name, pass: !!pass, detail: detail ? String(detail) : '' });
  if (verbose || !pass) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  [${group}] ${name}${detail && (!pass || verbose) ? `  (${String(detail).slice(0, 400)})` : ''}`);
  return !!pass;
}

async function open(browser, url, backend, { name, mobile = false, theme = 'dark' }) {
  const viewport = VIEWPORTS[mobile ? 'mobile' : 'desktop'];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, hasTouch: mobile, isMobile: mobile });
  // The stand-in backend: one JSON request in, one JSON answer out (see fake.ts, bindingTransport).
  await context.exposeBinding('__ssaCloudFake', (_source, json) => backend.handleJson(json));
  await context.addInitScript(() => {
    try {
      if (localStorage.getItem('e2e:seeded') != null) return;
      localStorage.setItem('ssa:shell.onboarding', '{"skipped":true}');
      localStorage.setItem('e2e:seeded', '1');
    } catch {
      /* storage refused: the app runs from memory */
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.some((p) => p.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  const ctx = {
    name,
    context,
    page,
    errors,
    /** A fresh page load. */
    async goto(hash, waitFor) {
      await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
      await page.waitForSelector('main[data-route]', { timeout: T });
      if (waitFor) await page.waitForSelector(waitFor, { timeout: T });
    },
    /** Move inside the app, as a tap on a link does: the page (and sync) keep running. */
    async nav(hash, waitFor) {
      await page.evaluate((h) => {
        location.hash = h;
      }, hash);
      if (waitFor) await page.waitForSelector(waitFor, { timeout: T });
      await page.waitForTimeout(300);
    },
    async shot(file, fullPage = false) {
      if (shots) await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage });
    },
    async text(selector) {
      return (await page.locator(selector).first().innerText({ timeout: T }).catch(() => '')).replace(/\s+/g, ' ').trim();
    },
    async sideways() {
      return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    },
    takeErrors() {
      return errors.splice(0);
    },
  };
  return ctx;
}

/** Wait until `fn` (in Node) is true. */
async function until(fn, timeout = T, step = 250) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
    await new Promise((resolve) => setTimeout(resolve, step));
  }
}

/** Sign in through Me > Account, reading the code from the stand-in mailbox. */
async function signIn(ctx, backend, { keyboard = false } = {}) {
  const { page } = ctx;
  await page.waitForSelector('[data-account="signed-out"]', { timeout: T });
  await page.locator('[data-account-email-input]').fill(EMAIL);
  if (keyboard) await page.locator('[data-account-email-input]').press('Enter');
  else await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.waitForSelector('[data-account="code-sent"]', { timeout: T });
  const code = backend.lastCode(EMAIL);
  await page.locator('[data-account-code-input]').fill(code);
  await page.waitForSelector('[data-account="signed-in"]', { timeout: T });
  return page.waitForSelector('[data-status="account-sync"][data-sync-state="synced"]', { timeout: T }).then(
    () => true,
    () => false,
  );
}

async function journalTitles(ctx) {
  return ctx.page.evaluate(() => {
    try {
      return (JSON.parse(localStorage.getItem('ssa:practice.data') || '{}').journal || []).map((e) => e.title);
    } catch {
      return [];
    }
  });
}

async function addEntry(ctx, entry) {
  await ctx.page.evaluate(async (e) => {
    const practice = await import('/src/features/practice/model/store.ts');
    const progress = await import('/src/core/progress/index.ts');
    const now = Date.now();
    practice.addJournalEntry({ startedAt: now - 900_000, endedAt: now, day: progress.getProgress().meta.today, plannedSec: 900, practisedSec: 900, blocks: [], xp: 12, feel: 4, note: '', endedEarly: false, ...e });
  }, entry);
}

async function syncNowOnAccount(ctx) {
  await ctx.nav('profile--account', '[data-status="account-sync"]');
  const button = ctx.page.locator('[data-sync-action="sync-now"]');
  if (await button.count()) await button.click();
}

async function main() {
  const fake = await loadTs('/src/core/platform/cloud/fake.ts');
  // Supabase's limits, but a short wait between two codes for one address so the check is quick.
  const backend = fake.createFakeServer({ resendSeconds: 2, pollWaitMs: 10_000 });
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const userRows = () => backend.rowsOf(backend.userId(EMAIL) || 'nobody');
  const cloudText = () => JSON.stringify(userRows());
  try {
    const phone = await open(browser, server.url, backend, { name: 'phone', mobile: true });
    const desktop = await open(browser, server.url, backend, { name: 'desktop' });

    // -- sign-in -------------------------------------------------------------------------------
    {
      const group = 'sign-in';
      await phone.goto('profile--account', '[data-account="signed-out"]');
      const hero = await phone.text('[data-account-step="email"]');
      check(group, 'Me > Account offers to sign in, says what it is for and that no password is needed', /Your progress on all your devices/.test(hero) && /6-digit code/.test(hero) && /never wiped/.test(hero) && /without an account/.test(hero), hero);
      check(group, 'the phone page has no sideways scroll', (await phone.sideways()) <= 0);
      await phone.shot('phone-signed-out');
      await phone.page.locator('[data-account-email-input]').fill(EMAIL);
      await phone.page.locator('[data-account-email-input]').press('Enter');
      await phone.page.waitForSelector('[data-account="code-sent"]', { timeout: T });
      const sentTo = await phone.text('[data-account-sent-to]');
      const focused = await phone.page.evaluate(() => document.activeElement?.hasAttribute('data-account-code-input') ?? false);
      check(group, 'Enter in the email field sends one code to that address, and the code field takes the focus', sentTo === EMAIL && backend.mail.length === 1 && focused, `${sentTo} mails=${backend.mail.length} focused=${focused}`);
      await phone.shot('phone-code');
      const code = backend.lastCode(EMAIL);
      await phone.page.locator('[data-account-code-input]').fill(code === '111111' ? '222222' : '111111');
      const refused = await phone.page.locator('[data-account-form="code"] [role="alert"]').innerText({ timeout: T }).catch(() => '');
      check(group, 'a wrong code is refused kindly and the learner can type again', /does not match/.test(refused) && (await phone.page.locator('[data-account="code-sent"]').count()) === 1, refused);
      await phone.shot('phone-wrong-code');
      await phone.page.locator('[data-account-code-input]').fill(code);
      await phone.page.waitForSelector('[data-account="signed-in"]', { timeout: T });
      const synced = await phone.page.waitForSelector('[data-status="account-sync"][data-sync-state="synced"]', { timeout: T }).then(() => true, () => false);
      const who = await phone.text('[data-account-email]');
      check(group, 'the right code signs in; Account names the email and says it is synced with the account', synced && who === EMAIL && /Synced with your account/.test(await phone.text('[data-status="account-sync"]')), who);
      await phone.shot('phone-signed-in');
    }

    // -- phone: a lesson and a journal entry -----------------------------------------------------
    let lesson = null;
    {
      const group = 'phone';
      lesson = await phone.page.evaluate(async (secret) => {
        const theory = await import('/src/content/theory/index.ts');
        const progress = await import('/src/core/progress/index.ts');
        const storage = await import('/src/core/platform/storage.ts');
        const placed = theory.outlineUnits()[0];
        const first = placed.unit.lessons[0];
        const skill = `theory:${placed.unit.id}:${first.id}`;
        progress.recordActivity({ kind: 'theory-lesson', id: skill, title: first.title, accuracy: 1, mistakes: 0, durationSec: 300, route: 'learn', params: [placed.unit.id, first.id] });
        storage.writeRaw('ai.anthropic-key', secret);
        return { skill, title: first.title, xp: progress.getProgress().xp.total };
      }, SECRET);
      await addEntry(phone, { id: 'e2e-phone-bus', title: 'On the bus: chord changes', note: 'G to C is getting smoother' });
      await syncNowOnAccount(phone);
      const arrived = await until(() => cloudText().includes('On the bus: chord changes') && cloudText().includes(lesson.skill));
      check(group, 'the finished lesson and the journal entry reach the cloud', arrived && lesson.xp > 0, `xp=${lesson.xp}`);
      const session = await phone.page.evaluate(() => localStorage.getItem('ssa:sync.auth.session') || '');
      const tokens = (() => {
        try {
          const s = JSON.parse(session);
          return [s.access_token, s.refresh_token].filter(Boolean);
        } catch {
          return [];
        }
      })();
      const text = cloudText();
      check(group, 'the session is kept in sync.auth.* on the device, and neither it nor the AI key is in the cloud', tokens.length === 2 && !tokens.some((t) => text.includes(t)) && !text.includes('sk-ant') && !text.includes('sync.auth'), `tokens=${tokens.length}`);
      const backup = await phone.page.evaluate(async () => JSON.stringify(await (await import('/src/core/progress/index.ts')).createBackup()));
      check(group, 'a backup file has neither the session nor the AI key', !tokens.some((t) => backup.includes(t)) && !backup.includes('sync.auth') && !backup.includes('sk-ant'));
    }

    // -- desktop signs in and sees it -----------------------------------------------------------
    {
      const group = 'desktop';
      await new Promise((resolve) => setTimeout(resolve, 2500)); // one code per address per (short) wait
      await desktop.goto('profile--account', '[data-account="signed-out"]');
      await desktop.shot('desktop-signed-out');
      const synced = await signIn(desktop, backend);
      check(group, 'the desktop signs in with the same email and is synced', synced);
      const state = await desktop.page.evaluate(async (skill) => {
        const progress = await import('/src/core/progress/index.ts');
        const s = progress.getProgress();
        return { xp: s.xp.total, done: s.skills[skill]?.completed === true };
      }, lesson.skill);
      check(group, 'it has the lesson the phone finished and the same XP', state.done && state.xp === lesson.xp, JSON.stringify(state));
      await desktop.shot('desktop-signed-in');
      await desktop.nav('practice--journal');
      const seen = await desktop.page.waitForFunction(() => document.querySelector('main')?.innerText.includes('On the bus: chord changes'), null, { timeout: T }).then(() => true, () => false);
      check(group, 'the phone’s journal entry is on the desktop’s practice journal screen', seen);
      await desktop.shot('desktop-journal');
    }

    // -- the desktop changes something; the phone sees it -------------------------------------------
    {
      const group = 'back';
      await phone.nav('profile', '[data-profile-section="overview"]');
      await addEntry(desktop, { id: 'e2e-desk', title: 'At the desk with the guitar', note: 'Barre F, slowly' });
      await desktop.page.evaluate(async () => (await import('/src/core/progress/index.ts')).setProfile({ name: 'Robin at the desk' }));
      await syncNowOnAccount(desktop);
      const named = await phone.page.waitForFunction(() => document.querySelector('[data-profile-name]')?.textContent === 'Robin at the desk', null, { timeout: T }).then(() => true, () => false);
      check(group, 'the new name reaches the phone’s open Me screen without a reload', named);
      await phone.shot('phone-overview-after-desktop');
      await phone.nav('practice--journal');
      const seen = await phone.page.waitForFunction(() => document.querySelector('main')?.innerText.includes('At the desk with the guitar'), null, { timeout: T }).then(() => true, () => false);
      const titles = await journalTitles(phone);
      check(group, 'the desktop’s journal entry is on the phone, and the phone’s own is still there', seen && titles.includes('On the bus: chord changes'), titles.join(' | '));
      await phone.shot('phone-journal');
    }

    // -- Your data ------------------------------------------------------------------------------
    {
      const group = 'your-data';
      await phone.nav('profile--data', '[data-status="sync"]');
      await phone.page.waitForFunction(() => /Synced with your account/.test(document.querySelector('[data-status="sync"]')?.textContent || ''), null, { timeout: T }).catch(() => undefined);
      const row = await phone.text('[data-status="sync"]');
      const button = await phone.page.locator('[data-status="sync"] button').innerText().catch(() => '');
      const stays = await phone.text('[data-stays] [data-line="sign-in"]');
      check(group, 'the sync row says it is synced with the account, offers Sync now, and says what travels', /Synced with your account/.test(row) && /Last synced/.test(row) && /rhythm calibration/.test(row) && /Sync now/.test(button), row);
      check(group, '"Stays on this device" names the sign-in', /Your sign-in/.test(stays), stays);
      await phone.shot('phone-your-data', true);
    }

    // -- offline ---------------------------------------------------------------------------------
    {
      const group = 'offline';
      await desktop.nav('profile--account', '[data-status="account-sync"]');
      await desktop.context.setOffline(true);
      const offline = await desktop.page.waitForSelector('[data-status="account-sync"][data-sync-state="offline"]', { timeout: T }).then(() => true, () => false);
      await addEntry(desktop, { id: 'e2e-offline', title: 'Offline on the train' });
      // The data tracker notices a feature's write within half a minute (sync.ts, storage-scope.ts).
      await desktop.page.waitForFunction(() => /waiting to be sent/.test(document.querySelector('[data-status="account-sync"]')?.textContent || ''), null, { timeout: 60_000 }).catch(() => undefined);
      const row = await desktop.text('[data-status="account-sync"]');
      check(group, 'offline: the status says so calmly and that changes wait', offline && /Offline/.test(row) && /waiting to be sent/.test(row), row);
      await desktop.shot('desktop-offline');
      check(group, 'nothing reached the cloud while offline', !cloudText().includes('Offline on the train'));
      await desktop.context.setOffline(false);
      const back = await until(() => cloudText().includes('Offline on the train'), 90_000);
      const onPhone = await until(async () => (await journalTitles(phone)).includes('Offline on the train'), 60_000);
      check(group, 'back online, the change is sent by itself and arrives on the phone', back && onPhone);
    }

    // -- reload ----------------------------------------------------------------------------------
    {
      const group = 'reload';
      await phone.goto('profile--account', '[data-account="signed-in"]');
      const synced = await phone.page.waitForSelector('[data-status="account-sync"][data-sync-state="synced"]', { timeout: T }).then(() => true, () => false);
      check(group, 'after a reload the phone is still signed in, and syncing', synced && (await phone.text('[data-account-email]')) === EMAIL);
    }

    // -- "Try again" restarts sync: Realtime must still deliver at once -------------------------------
    {
      const group = 'restart';
      // What the Try again button does. The old service's Realtime channel is still leaving when the
      // new one starts; realtime-js (and the stand-in) would hand that leaving channel back if both
      // had the same name, and the new service would hear nothing until the 3-minute poll.
      await phone.nav('profile--account', '[data-status="account-sync"][data-sync-state="synced"]');
      await phone.page.evaluate(async () => (await import('/src/core/platform/sync.ts')).restartCloudSync());
      await phone.page.waitForSelector('[data-status="account-sync"][data-sync-state="synced"]', { timeout: T });
      await phone.page.waitForTimeout(1500);
      await desktop.page.evaluate(async () => (await import('/src/core/progress/index.ts')).setProfile({ name: 'Robin after a restart' }));
      await syncNowOnAccount(desktop);
      const sent = await until(() => cloudText().includes('Robin after a restart'), 30_000);
      const heard = await until(async () => (await phone.page.evaluate(async () => (await import('/src/core/progress/index.ts')).getProgress().profile.name)) === 'Robin after a restart', 20_000);
      check(group, 'after a restart of sync on the phone, the desktop’s change still arrives within seconds (Realtime, not the poll)', sent && heard);
    }

    // -- sign out, keeping progress ---------------------------------------------------------------
    {
      const group = 'sign-out';
      await desktop.nav('profile--account', '[data-account="signed-in"]');
      await desktop.page.locator('[data-account-signout]').click();
      await desktop.page.waitForSelector('[role="dialog"]', { timeout: T });
      await desktop.shot('desktop-sign-out-dialog');
      await desktop.page.locator('[data-account-signout-confirm]').click();
      await desktop.page.waitForSelector('[data-account="signed-out"]', { timeout: T });
      const session = await desktop.page.evaluate(() => localStorage.getItem('ssa:sync.auth.session'));
      const titles = await journalTitles(desktop);
      check(group, '"Keep it on this device": signed out, the session is gone from storage, the progress is still here', session === null && titles.includes('On the bus: chord changes') && titles.includes('Offline on the train'), titles.join(' | '));
    }

    // -- delete the cloud data ---------------------------------------------------------------------
    {
      const group = 'delete';
      await phone.nav('profile--account', '[data-account="signed-in"]');
      await phone.page.locator('[data-account-delete]').click();
      await phone.page.waitForSelector('[role="dialog"]', { timeout: T });
      await phone.shot('phone-delete-dialog');
      await phone.page.locator('[data-account-delete-confirm]').click();
      const notice = await phone.page.waitForSelector('[data-account-notice="deleted"]', { timeout: T }).then(() => true, () => false);
      const rows = userRows().map((r) => `${r.path}:${r.data.kind}`);
      const titles = await journalTitles(phone);
      check(group, 'only the "erased" marker is left in the cloud; the phone keeps its progress and says what happened', notice && rows.join() === 'progress:erased' && titles.includes('At the desk with the guitar'), rows.join());
      await phone.shot('phone-deleted');
    }

    // -- the desktop, signed out before the deletion, signs in again --------------------------------
    {
      const group = 'again';
      await new Promise((resolve) => setTimeout(resolve, 2500)); // one code per address per (short) wait
      await desktop.nav('profile--account', '[data-account="signed-out"]');
      const synced = await signIn(desktop, backend);
      await desktop.page.waitForTimeout(2000);
      const phase = await desktop.page.getAttribute('[data-account]', 'data-account');
      const notice = await desktop.page.locator('[data-account-notice]').count();
      const head = userRows().find((r) => r.path === 'progress');
      check(group, 'signing in again starts a fresh cloud copy from the desktop, instead of being signed straight out', synced && phase === 'signed-in' && notice === 0 && head?.data.kind === 'progress-sync' && JSON.stringify(head.data).includes('Offline on the train'), `${phase} notice=${notice} head=${head?.data.kind}`);
    }

    // -- an expired code, a code asked for again too soon, too many emails -----------------------------
    {
      const group = 'limits';
      // Its own backend with Supabase's real wait of a minute between two codes for one address, an
      // hourly limit of one email in all (the built-in mailer allows a couple), and a browser clock
      // the check can move an hour on.
      let skew = 0;
      const limited = fake.createFakeServer({ emailsPerHour: 1, resendSeconds: 60, now: () => Date.now() + skew });
      const lim = await open(browser, server.url, limited, { name: 'limits', mobile: true, theme: 'light' });
      await lim.context.clock.install();
      await lim.goto('profile--account', '[data-account="signed-out"]');
      await lim.page.locator('[data-account-email-input]').fill('one@example.com');
      await lim.page.getByRole('button', { name: 'Email me a code' }).click();
      await lim.page.waitForSelector('[data-account="code-sent"]', { timeout: T });
      const resend = lim.page.locator('[data-account-resend]');
      const waiting = (await resend.innerText()).trim();
      check(group, 'right after sending, "Send a new code" waits out the minute and says how long', /in (1:00|0:[0-5]\d)/.test(waiting) && (await resend.isDisabled()), waiting);
      const oldCode = limited.lastCode('one@example.com');
      skew += 61 * 60_000;
      await lim.page.clock.fastForward(61 * 60_000);
      await lim.page.locator('[data-account-code-input]').fill(oldCode);
      const expired = await lim.page.locator('[data-account-form="code"] [role="alert"]').innerText({ timeout: T }).catch(() => '');
      check(group, 'a code more than an hour old is called expired, kindly, with the way out next to it', /expired/.test(expired) && /new one/.test(expired) && !(await resend.isDisabled()), expired);
      await lim.shot('phone-light-expired-code');
      await resend.click();
      const resent = await until(() => limited.mail.length === 2, T);
      await lim.page.getByRole('button', { name: 'Use a different email' }).click();
      await lim.page.waitForSelector('[data-account="signed-out"]', { timeout: T });
      await lim.page.locator('[data-account-email-input]').fill('two@example.com');
      await lim.page.getByRole('button', { name: 'Email me a code' }).click();
      const limitHit = await lim.page.locator('[data-account-form="email"] [role="alert"]').innerText({ timeout: T }).catch(() => '');
      check(group, 'past the project’s email limit: one plain sentence, nothing sent, and the app keeps working', resent && /Too many sign-in emails/.test(limitHit) && /works fully on this device/.test(limitHit) && limited.mail.length === 2 && (await lim.page.locator('[data-account="signed-out"]').count()) === 1, `${limitHit} mails=${limited.mail.length}`);
      check(group, 'no sideways scroll on the phone with the error showing', (await lim.sideways()) <= 0);
      await lim.shot('phone-light-too-many-emails');
      const noise = lim.takeErrors();
      check(group, 'no errors in this browser', noise.length === 0, noise[0]);
      await lim.context.close();
    }

    // -- the suggestion ----------------------------------------------------------------------------
    {
      const group = 'suggest';
      const fresh = await open(browser, server.url, backend, { name: 'fresh', theme: 'light' });
      await fresh.goto('profile', '[data-profile-section="overview"]');
      const lessons = async (n) =>
        fresh.page.evaluate(async (count) => {
          const progress = await import('/src/core/progress/index.ts');
          for (let i = 0; i < count; i++) progress.recordActivity({ kind: 'theory-lesson', id: `theory:e2e-unit:lesson-${Date.now()}-${i}`, title: 'A lesson', accuracy: 1, durationSec: 240 });
        }, n);
      await lessons(2);
      await fresh.page.waitForTimeout(800);
      const early = await fresh.page.locator('[data-account-suggestion]').count();
      await lessons(1);
      const shown = await fresh.page.waitForSelector('[data-account-suggestion]', { timeout: T }).then(() => true, () => false);
      // Three lessons level a new learner up: close the shell's celebration first.
      await fresh.page.waitForTimeout(1500);
      for (let i = 0; i < 5 && (await fresh.page.locator('[role="dialog"][aria-modal="true"]').count()); i++) {
        await fresh.page.keyboard.press('Escape');
        await fresh.page.waitForTimeout(600);
      }
      check(group, 'no suggestion after two lessons; after the third, a gentle one on Me', early === 0 && shown);
      await fresh.shot('desktop-light-suggestion');
      await fresh.page.locator('[data-account-suggestion]').getByRole('button', { name: 'Not now' }).click();
      const gone = await fresh.page.locator('[data-account-suggestion]').count();
      await fresh.goto('profile', '[data-profile-section="overview"]');
      await fresh.page.waitForTimeout(1500);
      check(group, '"Not now" hides it, also after a reload', gone === 0 && (await fresh.page.locator('[data-account-suggestion]').count()) === 0);
      await fresh.goto('profile--account', '[data-account="signed-out"]');
      await fresh.shot('desktop-light-signed-out');
      const noise = fresh.takeErrors();
      check(group, 'no errors in the third browser', noise.length === 0, noise[0]);
      await fresh.context.close();
    }

    // -- layout ----------------------------------------------------------------------------------
    {
      const group = 'layout';
      const parts = ['profile', 'profile--achievements', 'profile--shop', 'profile--settings', 'profile--account', 'profile--data', 'profile--about'];
      for (const ctx of [phone, desktop]) {
        const problems = [];
        for (const hash of parts) {
          await ctx.nav(hash, '[data-profile-section]');
          await ctx.page.waitForTimeout(400);
          const info = await ctx.page.evaluate(() => ({ h1: document.querySelectorAll('main h1').length, links: document.querySelectorAll('nav[aria-label="Me"] a').length, error: !!document.querySelector('[data-shell-error], [role="alert"][data-error-boundary]') }));
          if (info.h1 !== 1 || info.links !== 7 || info.error) problems.push(`${hash}: ${JSON.stringify(info)}`);
          if (ctx === phone && (await ctx.sideways()) > 0) problems.push(`${hash}: sideways scroll`);
        }
        check(group, `${ctx.name}: all seven parts of Me open cleanly, Account among them`, problems.length === 0, problems.join(' | '));
      }
      await phone.nav('profile--account', '[data-account]');
      await phone.page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await phone.page.waitForTimeout(600);
      const wide = await phone.sideways();
      await phone.shot('phone-200-text', true);
      await phone.page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      check(group, 'at 200 % text the phone Account page has no sideways scroll', wide <= 0, `${wide}px`);
    }

    for (const ctx of [phone, desktop]) {
      const noise = ctx.takeErrors();
      check('errors', `${ctx.name}: no console errors`, noise.length === 0, noise.slice(0, 3).join(' / '));
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const groups = [...new Set(results.map((r) => r.group))];
  for (const group of groups) {
    const rows = results.filter((r) => r.group === group);
    const failed = rows.filter((r) => !r.pass).length;
    console.log(`${failed ? 'FAIL' : 'ok  '}  ${group}: ${rows.length - failed}/${rows.length}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  if (shots) console.log(`screenshots: ${path.relative(ROOT, OUT)}/`);
  console.log(failed ? `${failed} check(s) failed` : `all ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
