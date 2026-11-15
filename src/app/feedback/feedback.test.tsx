// @vitest-environment jsdom
/**
 * The feedback layer end to end: real progress actions on a test store, and what the learner
 * then sees (toasts, the level-up dialog, the lost-heart flash).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActions, createProgressStore, memoryStorage, setProgressStore, type ProgressActions, type ProgressStore } from '@/core/progress';
import { UIProvider, toast } from '@/ui';
import { statsSheet } from '../shell/stats';
import { GlobalFeedback } from './GlobalFeedback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    toast.clear();
    root.unmount();
  });
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
  it('says the goal is met in one toast, XP included', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 10 });
      actions.awardXp(10, 'test');
    });
    await moment();
    const ids = toasts().map((t) => t.id);
    expect(ids).toContain('shell-goal');
    expect(ids).not.toContain('shell-xp');
    const goal = toasts().find((t) => t.id === 'shell-goal');
    expect(goal?.text).toContain('Daily goal met');
    expect(goal?.text).toContain('+10 XP');
    expect(goal?.text).toContain('1 day streak');
  });

  it('opens the stats sheet from the goal toast', async () => {
    await act(async () => {
      actions.setPrefs({ dailyGoalXp: 10 });
      actions.awardXp(10, 'test');
    });
    await moment();
    const view = Array.from(document.querySelectorAll('[data-toast="shell-goal"] button')).find((b) => b.textContent === 'View') as HTMLButtonElement;
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
    expect(toasts().map((t) => t.id)).toContain('shell-goal');
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
