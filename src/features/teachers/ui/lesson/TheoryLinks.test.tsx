// @vitest-environment jsdom
/**
 * A theory link on a teacher lesson's summary is a side trip. Review bug: Back from the theory
 * lesson went to the finished lesson's address, which started "Meet your guitar" over at step 1.
 */
import { describe, expect, it } from 'vitest';
import { openTheorySideTrip } from './TheoryLinks';

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

describe('a theory link from a summary', () => {
  it("leaves the teacher's course page behind it, so Back never restarts the lesson just finished", async () => {
    window.location.hash = '#teachers--mia--meet-your-guitar';
    await settle();
    // The shell tags each history entry for its scroll bookkeeping: the tag must survive.
    window.history.replaceState({ ssaEntry: 7 }, '', window.location.href);
    const length = window.history.length;

    openTheorySideTrip('mia', 'the-six-strings', 'string-numbers');
    expect(window.location.hash).toBe('#learn--the-six-strings--string-numbers');
    expect(window.history.length).toBe(length + 1);

    window.history.back();
    await settle();
    expect(window.location.hash).toBe('#teachers--mia');
    expect((window.history.state as { ssaEntry?: number } | null)?.ssaEntry).toBe(7);
  });
});
