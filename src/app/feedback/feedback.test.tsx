// @vitest-environment jsdom
/**
 * The feedback layer end to end: real progress actions on a test store, and what the learner
 * then sees (toasts, the level-up dialog, the lost-heart flash).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActions, createProgressStore, memoryStorage, setProgressStore, type ProgressActions, type ProgressStore } from '@/core/progress';
import { Sheet, UIProvider, toast } from '@/ui';
import { statsSheet } from '../shell/stats';
import { GlobalFeedback } from './GlobalFeedback';
import { holdRewards, rewardsHeld, useRewardHandoff } from './hold';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The interface sounds the shell plays, by name (they are silent in jsdom; this is what was asked for).
const played = vi.hoisted(() => [] as string[]);
vi.mock('./sounds', async (importOriginal) => {
  const real = await importOriginal<typeof import('./sounds')>();
  return {
    ...real,
    playShellSound: (...args: Parameters<typeof real.playShellSound>) => {
      played.push(args[0]);
      real.playShellSound(...args);
    },
  };
});

let root: Root;
let host: HTMLElement;
let store: ProgressStore;
let actions: ProgressActions;

/** Let the 60 ms "one moment" window of the feedback layer pass. */
const moment = async (ms = 90) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const toasts = () => Array.from(document.querySelectorAll('[data-toast]')).map((el) => ({ id: el.getAttribute('data-toast'), text: el.textContent ?? '' }));
const dialog = () => document.querySelector('[role="dialog"]');
const releases: Array<() => void> = [];
/** A lesson's steps come on screen (the runner holds the rewards); returns its end. */
const lessonStarts = async () => {
  let release = () => undefined as void;
  await act(async () => {
    release = holdRewards();
  });
  releases.push(release);
  return async () => {
    await act(async () => release());
  };
};
const keepGoing = async () => {
  for (let i = 0; i < 3 && dialog(); i++) {
    const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
    await act(async () => button?.click());
    await moment(400);
  }
};

beforeEach(async () => {
  vi.useFakeTimers();
  store = createProgressStore({ storage: memoryStorage() });
  actions = createActions(() => store);
  setProgressStore(store);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <UIProvider>
        <GlobalFeedback />
      </UIProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => {
    for (const release of releases.splice(0)) release();
    toast.clear();
    root.unmount();
  });
  document.documentElement.style.fontSize = '';
  host.remove();
  document.body.innerHTML = '';
  setProgressStore(null);
  statsSheet.set(null);
  vi.useRealTimers();
});

describe('XP', () => {
  it('shows one toast per moment and keeps counting in the same toast', async () => {
    await act(async () => {
      actions.awardXp(5, 'test');
    });
    expect(toasts()).toEqual([]); // still inside the settle window
    await moment();
    expect(toasts().map((t) => t.id)).toEqual(['shell-xp']);
    expect(toasts()[0].text).toContain('+5 XP');
    expect(toasts()[0].text).toContain("15 XP to go for today's goal");

    await act(async () => {
      actions.awardXp(3, 'test');
    });
    await moment();
    expect(toasts().map((t) => t.id)).toEqual(['shell-xp']);
    expect(toasts()[0].text).toContain('+8 XP');
  });

  it('batches gains that land together', async () => {
    await act(async () => {
      actions.awardXp(4, 'test');
      actions.awardXp(6, 'test');
    });
    await moment();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].text).toContain('+10 XP');
  });
});

describe('goal and level', () => {
  it('says the goal is met on one card, XP and the rest of the moment included', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 10 });
      actions.awardXp(10, 'test');
    });
    await moment();
    // The goal leads; anything else the moment earned (a first achievement) is a line under it.
    expect(toasts()).toHaveLength(1);
    const card = toasts()[0];
    expect(['shell-goal', 'shell-reward']).toContain(card.id);
    expect(card.text).toContain('Daily goal met');
    expect(card.text).toContain('+10 XP');
    expect(card.text).toContain('1 day streak');
  });

  it('opens the stats sheet from the goal card', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 10 });
      actions.awardXp(10, 'test');
    });
    await moment();
    const view = Array.from(document.querySelectorAll('[data-toast] button')).find((b) => b.textContent === 'View') as HTMLButtonElement;
    await act(async () => {
      view.click();
    });
    expect(statsSheet.get()).toBe('streak');
  });

  it('gives a new level a dialog first, and the toasts only after it is closed', async () => {
    await act(async () => {
      actions.awardXp(25, 'test'); // level 2 starts at 20 XP; the default goal of 20 is met too
    });
    await moment();
    expect(dialog()?.textContent).toContain('Level up');
    expect(dialog()?.textContent).toContain('First Fret');
    expect(dialog()?.textContent).toContain('+10 gems');
    expect(toasts()).toEqual([]);

    const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    await moment(400);
    expect(dialog()).toBeNull();
    expect(toasts().some((t) => t.text.includes('Daily goal met'))).toBe(true);
  });
});

describe('a moment that earns a lot', () => {
  it('puts its rewards on one card instead of a stack that would bury the summary', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 50 });
      actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', title: 'A sound is a vibration', accuracy: 1, perfect: true, mistakes: 0, durationSec: 240 });
    });
    await moment();
    const shown = toasts();
    expect(shown.length).toBeLessThanOrEqual(3);
    const card = shown.find((t) => t.id === 'shell-reward');
    expect(card?.text).toMatch(/\+\d+ XP/);
    // Each further piece of news is a line of the card, not a toast of its own.
    expect(document.querySelectorAll('[data-toast="shell-reward"] li').length).toBeGreaterThanOrEqual(1);
    expect(shown.map((t) => t.id)).not.toContain('shell-xp');
  });

  it('keeps the card off an open sheet: it waits, and shows once the sheet has closed', async () => {
    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    const sheetRoot = createRoot(sheet);
    await act(async () => {
      sheetRoot.render(
        <Sheet open onClose={() => undefined} title="Results">
          Three stars
        </Sheet>,
      );
    });
    await act(async () => {
      actions.awardXp(12, 'song');
    });
    await moment();
    expect(toasts()).toEqual([]);
    await act(async () => {
      sheetRoot.render(
        <Sheet open={false} onClose={() => undefined} title="Results">
          Three stars
        </Sheet>,
      );
    });
    await moment(400);
    expect(toasts().map((t) => t.text).join(' ')).toContain('+12 XP');
    await act(async () => sheetRoot.unmount());
    sheet.remove();
  });

  it('keeps every reward that arrives while a sheet stays open, however long it stays open', async () => {
    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    const sheetRoot = createRoot(sheet);
    const render = (open: boolean) =>
      act(async () => {
        sheetRoot.render(
          <Sheet open={open} onClose={() => undefined} title="Results">
            Three stars
          </Sheet>,
        );
      });
    await render(true);
    await act(async () => {
      actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', accuracy: 0.9, stars: 2, durationSec: 120 });
    });
    await moment();
    // Long after the card would have left the screen, more news: it must join, not replace it.
    await moment(20_000);
    await act(async () => {
      actions.recordActivity({ kind: 'tuner', durationSec: 60 });
    });
    await moment();
    expect(toasts()).toEqual([]);
    await render(false);
    await moment(400);
    // A new level may have earned its own dialog: the toasts come after it.
    for (let i = 0; i < 3 && dialog(); i++) {
      const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
      await act(async () => button?.click());
      await moment(400);
    }
    const text = toasts().map((t) => t.text).join(' | ');
    expect(text).toMatch(/XP/);
    expect(toasts().length).toBeLessThanOrEqual(3);
    // The song's news (its crown) is still there next to the tuner's.
    expect(text).toContain('Greensleeves');
    await act(async () => sheetRoot.unmount());
    sheet.remove();
  });
});

describe('the reward card does not bring back old news', () => {
  it('a sheet opened long after a card has gone does not revive that card when new news arrives', async () => {
    await act(async () => {
      actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', accuracy: 0.9, stars: 2, durationSec: 120 });
    });
    await moment();
    for (let i = 0; i < 3 && dialog(); i++) {
      const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
      await act(async () => button?.click());
      await moment(400);
    }
    expect(toasts().map((t) => t.text).join(' ')).toContain('Greensleeves');
    // The card has long left the screen.
    await moment(60_000);
    expect(toasts()).toEqual([]);

    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    const sheetRoot = createRoot(sheet);
    const render = (open: boolean) =>
      act(async () => {
        sheetRoot.render(
          <Sheet open={open} onClose={() => undefined} title="Settings">
            Something else
          </Sheet>,
        );
      });
    await render(true);
    await act(async () => {
      actions.awardXp(3, 'test');
    });
    await moment();
    await render(false);
    await moment(400);
    // The XP may have earned a level: its dialog first, then the card.
    for (let i = 0; i < 3 && dialog(); i++) {
      const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
      await act(async () => button?.click());
      await moment(400);
    }
    const text = toasts().map((t) => t.text).join(' | ');
    expect(text).toContain('+3 XP');
    expect(text).not.toContain('Greensleeves');
    await act(async () => sheetRoot.unmount());
    sheet.remove();
  });

  it('a card a sheet sent aside before it was read still takes the news that arrives while the sheet stays open', async () => {
    await act(async () => {
      actions.recordActivity({ kind: 'song', id: 'song:greensleeves', title: 'Greensleeves', accuracy: 0.9, stars: 2, durationSec: 120 });
    });
    await moment();
    for (let i = 0; i < 3 && dialog(); i++) {
      const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
      await act(async () => button?.click());
      await moment(400);
    }
    expect(toasts().map((t) => t.text).join(' ')).toContain('Greensleeves');
    // A sheet opens while the card is still up: the card steps aside, unread.
    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    const sheetRoot = createRoot(sheet);
    const render = (open: boolean) =>
      act(async () => {
        sheetRoot.render(
          <Sheet open={open} onClose={() => undefined} title="Results">
            Two stars
          </Sheet>,
        );
      });
    await render(true);
    await moment(30_000);
    await act(async () => {
      actions.awardXp(1, 'test');
    });
    await moment();
    expect(toasts()).toEqual([]);
    await render(false);
    await moment(400);
    for (let i = 0; i < 3 && dialog(); i++) {
      const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going' || b.textContent === 'Next') as HTMLButtonElement | undefined;
      await act(async () => button?.click());
      await moment(400);
    }
    expect(toasts().map((t) => t.text).join(' | ')).toContain('Greensleeves');
    await act(async () => sheetRoot.unmount());
    sheet.remove();
  });
});

describe('hearts', () => {
  it('flashes the count when a heart is lost, without a toast', async () => {
    await act(async () => {
      actions.loseHeart();
    });
    await moment();
    const flash = Array.from(document.querySelectorAll('[role="status"]')).find((el) => el.textContent?.includes('hearts left'));
    expect(flash?.textContent).toBe('4 hearts left');
    expect(toasts()).toEqual([]);
  });

  it('explains gently when the last heart goes', async () => {
    await act(async () => {
      for (let i = 0; i < 5; i++) actions.loseHeart();
    });
    await moment();
    const out = toasts().find((t) => t.id === 'shell-hearts');
    expect(out?.text).toContain('Out of hearts');
    expect(out?.text).toContain('Nothing is lost');
  });

  it('shows nothing in relaxed mode', async () => {
    await act(async () => {
      actions.setPrefs({ unlimitedHearts: true });
      actions.loseHeart();
    });
    await moment();
    expect(Array.from(document.querySelectorAll('[role="status"]')).some((el) => el.textContent?.includes('heart'))).toBe(false);
  });
});

describe('events from before the shell was listening', () => {
  it('are still shown (the store holds them for the first listener)', async () => {
    await act(async () => {
      root.unmount();
    });
    actions.awardXp(7, 'early');
    root = createRoot(host);
    await act(async () => {
      root.render(
        <UIProvider>
          <GlobalFeedback />
        </UIProvider>,
      );
    });
    await moment();
    expect(toasts()[0]?.text).toContain('+7 XP');
  });
});

describe('rewards between lessons', () => {
  // Review bug (about ten reviewers, theory and teacher courses): going straight from a summary to the
  // next lesson left "+XP / achievement / daily goal" and the level-up dialog over its first card
  // and answer buttons for several seconds on a 390 px phone.
  it("takes the last lesson's card off the screen when the next lesson starts", async () => {
    await act(async () => {
      actions.recordActivity({ kind: 'theory-lesson', id: 'theory:sound-and-pitch:a-sound-is-a-vibration', title: 'A sound is a vibration', accuracy: 1, perfect: true, mistakes: 0, durationSec: 240 });
    });
    await moment();
    await keepGoing();
    expect(toasts().length).toBeGreaterThan(0);
    await lessonStarts();
    await moment(400);
    expect(toasts()).toEqual([]);
    expect(dialog()).toBeNull();
  });

  it('holds news (a new level included) while the lesson runs and shows it at its end: the dialog first, then the card', async () => {
    const end = await lessonStarts();
    expect(rewardsHeld()).toBe(true);
    await act(async () => {
      actions.awardXp(25, 'test'); // a new level, the daily goal met
    });
    await moment(2000);
    expect(toasts()).toEqual([]);
    expect(dialog()).toBeNull();
    await end();
    await moment();
    expect(dialog()?.textContent).toContain('Level up');
    expect(toasts()).toEqual([]);
    await keepGoing();
    expect(toasts().map((t) => t.text).join(' ')).toContain('Daily goal met');
  });

  it('still flashes a lost heart at once: that is the lesson speaking', async () => {
    await lessonStarts();
    await act(async () => {
      actions.loseHeart();
    });
    await moment();
    expect(Array.from(document.querySelectorAll('[role="status"]')).some((el) => el.textContent === '4 hearts left')).toBe(true);
  });

  it('puts a level-up dialog nobody answered away while the lesson runs, and brings it back at its end', async () => {
    await act(async () => {
      actions.awardXp(25, 'test');
    });
    await moment();
    expect(dialog()?.textContent).toContain('Level up');
    const end = await lessonStarts();
    await moment(400);
    expect(dialog()).toBeNull();
    expect(toasts()).toEqual([]);
    await end();
    await moment(400);
    expect(dialog()?.textContent).toContain('Level up');
    await keepGoing();
    expect(toasts().map((t) => t.text).join(' ')).toContain('Daily goal met');
  });

  it('a dialog the learner already answered does not come back', async () => {
    await act(async () => {
      actions.awardXp(25, 'test');
    });
    await moment();
    const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going') as HTMLButtonElement;
    await act(async () => button.click());
    // The same key press both closed the dialog and went on to the next lesson.
    const end = await lessonStarts();
    await moment(400);
    expect(dialog()).toBeNull();
    expect(toasts()).toEqual([]);
    await end();
    await moment(400);
    expect(dialog()).toBeNull();
  });

  // Review bug: the card that waited behind that dialog was shown after the next lesson's own news,
  // so the next summary's card lost its XP to the last lesson's ("+25 XP" in the goal line, no "+7 XP").
  it("a card that waited behind an answered dialog joins the next summary's without hiding its XP", async () => {
    await act(async () => {
      actions.awardXp(25, 'test'); // a new level and the daily goal: the card waits behind the dialog
    });
    await moment();
    const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Keep going') as HTMLButtonElement;
    await act(async () => button.click());
    const end = await lessonStarts();
    await moment(400);
    expect(toasts()).toEqual([]);
    await act(async () => {
      actions.awardXp(7, 'the next lesson');
    });
    await moment(6000);
    await end();
    await moment(400);
    const text = toasts().map((t) => t.text).join(' ');
    expect(text).toContain('Daily goal met');
    expect(text).toContain('+7 XP');
  });

  // Review bug: a summary's "Next lesson" unmounts one screen and mounts the next in one commit, so
  // the hold went off and on again at once. In between, the held level-up was let through: its
  // confetti and sound fired over the next lesson's first card, and its dialog came later without them.
  it('a hold handed straight from one screen to the next lets nothing through in between', async () => {
    let first = () => undefined as void;
    await act(async () => {
      first = holdRewards();
    });
    await act(async () => {
      actions.awardXp(25, 'test'); // a new level and the daily goal, held
    });
    await moment(2000);
    played.length = 0;
    let second = () => undefined as void;
    await act(async () => {
      first();
      second = holdRewards();
    });
    releases.push(second);
    await moment(400);
    expect(played).toEqual([]);
    expect(dialog()).toBeNull();
    expect(toasts()).toEqual([]);
    await act(async () => second());
    await moment();
    expect(played).toContain('levelUp');
    expect(dialog()?.textContent).toContain('Level up');
  });

  it('useRewardHandoff holds from the tap until the screen that tapped unmounts', async () => {
    let handOff = () => undefined as void;
    function Summary() {
      handOff = useRewardHandoff();
      return null;
    }
    const other = document.createElement('div');
    const summaryRoot = createRoot(other);
    await act(async () => summaryRoot.render(<Summary />));
    expect(rewardsHeld()).toBe(false);
    await act(async () => {
      handOff();
      handOff(); // twice is one hold
    });
    expect(rewardsHeld()).toBe(true);
    await act(async () => summaryRoot.unmount());
    expect(rewardsHeld()).toBe(false);
  });
});

describe('the reward card at a large text size', () => {
  it('keeps each line to its title, so it stays small, and sizes its icons in rem', async () => {
    document.documentElement.style.fontSize = '32px';
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      await act(async () => {
        actions.setPrefs({ dailyGoalXp: 50 });
        actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', title: 'A sound is a vibration', accuracy: 1, perfect: true, mistakes: 0, durationSec: 240 });
      });
      await moment();
      await keepGoing();
      const lines = Array.from(document.querySelectorAll('[data-toast="shell-reward"] li'));
      expect(lines.length).toBeGreaterThan(0);
      // Only the title: "3 achievements unlocked", never "3 achievements unlocked · First Strum, ...".
      for (const li of lines) expect(li.textContent).not.toContain(' · ');
      expect(document.querySelector('[data-toast="shell-reward"] [data-toast-icon]')).not.toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('shows the details at the normal size', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 50 });
      actions.recordActivity({ kind: 'theory-lesson', id: 'theory:unit-1:lesson-1', title: 'A sound is a vibration', accuracy: 1, perfect: true, mistakes: 0, durationSec: 240 });
    });
    await moment();
    await keepGoing();
    const text = Array.from(document.querySelectorAll('[data-toast="shell-reward"] li')).map((li) => li.textContent).join(' | ');
    expect(text).toContain(' · ');
  });
});
