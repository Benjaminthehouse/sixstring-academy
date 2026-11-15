/**
 * Learner states for the browser checks of the Me area, built with the app's own progress store
 * (src/features/profile/testing/fixtures.ts) and handed to a browser context as saved storage.
 *
 *   const { buildSeeds, seedContext } = require('./profile-seed.cjs');
 *   const seeds = await buildSeeds();              // { rich, empty }: each { saved, state }
 *   await seedContext(context, seeds.rich.saved);  // before the first page.goto
 */
const { loadTs } = require('./lib/harness.cjs');

/** Build "Robin" (four months in) and a brand-new learner, both ending now. */
async function buildSeeds(now = Date.now()) {
  const fixtures = await loadTs('/src/features/profile/testing/fixtures.ts');
  const progress = await loadTs('/src/core/progress/index.ts');
  const dataModel = await loadTs('/src/features/profile/data/model.ts');
  const rich = fixtures.richFixture(now);
  const empty = fixtures.emptyFixture(now);
  const pack = (fixture) => {
    const state = fixture.store.getState();
    const level = progress.selectLevel(state);
    const achievements = progress.selectAchievements(state);
    const week = progress.selectWeek(state);
    return {
      saved: fixture.saved(),
      state: JSON.parse(JSON.stringify(state)),
      // What the screens should show, worked out by the store's own selectors.
      facts: {
        level: level.level,
        title: level.title,
        streak: progress.selectStreak(state).current,
        unlocked: achievements.unlocked,
        total: achievements.total,
        secretsFound: achievements.list.filter((a) => a.group === 'secret' && a.unlocked).length,
        hiddenNames: progress.ACHIEVEMENTS.filter((a) => a.secret && !state.achievements[a.id]).map((a) => a.name),
        gems: state.gems.balance,
        weekMinutes: week.map((d) => Math.round(d.sec / 60)),
        practisedDays: Object.values(state.days).filter((d) => d.n > 0).length,
      },
    };
  };
  return { rich: pack(rich), empty: pack(empty), now, fingerprint: dataModel.progressFingerprint };
}

/**
 * Put a save file (and "the first-run flow was skipped") into the context's storage. It is written
 * once per context: a reload, an import or a reset inside the test keeps whatever the app saved.
 */
async function seedContext(context, saved, extra = {}) {
  const entries = { 'ssa:shell.onboarding': '{"skipped":true}', ...extra };
  if (saved) entries['ssa:progress'] = saved;
  await context.addInitScript((items) => {
    try {
      if (localStorage.getItem('e2e:seeded') != null) return;
      for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
      localStorage.setItem('e2e:seeded', '1');
    } catch {
      /* storage is unavailable: the app runs from memory */
    }
  }, entries);
}

module.exports = { buildSeeds, seedContext };
