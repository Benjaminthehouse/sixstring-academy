/**
 * A long phrase to play must never widen the page on a phone: its tab scrolls inside its own box.
 * Draws every play-phrase target of the lesson kit as wide as a 16-note phrase, then checks that
 * the page is still exactly as wide as the screen.
 *
 *   node e2e/lessons-overflow.cjs
 */
const { withApp } = require('./lib/harness.cjs');

(async () => {
  let failed = false;
  await withApp({ mobile: true }, async ({ page, goto }) => {
    await goto('kit-lessons');
    await page.waitForSelector('[class*="playTarget"] ol', { timeout: 60000 });
    const r = await page.evaluate(() => {
      const targets = [...document.querySelectorAll('[class*="playTarget"]')].filter((x) => x.querySelector('ol'));
      for (const t of targets) {
        const svg = t.querySelector('svg[class*="tab"]');
        if (svg) Object.assign(svg.style, { width: '1400px', minWidth: '1400px', maxWidth: 'none' });
      }
      return { targets: targets.length, page: document.documentElement.scrollWidth, screen: innerWidth };
    });
    const ok = r.targets > 0 && r.page <= r.screen;
    console.log(`${ok ? 'PASS' : 'FAIL'} play-phrase targets: ${r.targets}, page width ${r.page} on a ${r.screen} px screen`);
    if (!ok) failed = true;
  });
  process.exit(failed ? 1 : 0);
})();
