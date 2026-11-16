import { describe, expect, it } from 'vitest';
import { practiceTargets, flattenSong, sixTab, WaitMode } from '@/core/song';
import { StrumGate } from './strum';

/** Levels (dBFS) of chroma frames every 50 ms: a strum's attack, then its ring dying away. */
function strum(peak = -12, frames = 14): number[] {
  return [peak - 8, peak - 1, peak, ...Array.from({ length: frames - 3 }, (_, i) => peak - 0.9 * (i + 1))];
}

describe('one strum, one step', () => {
  it('stays shut while one chord rings, opens on the next strum', () => {
    const g = new StrumGate();
    expect(g.open).toBe(true);
    const first = strum();
    g.close(1.0, first[1]); // counted on its second frame, still in the attack
    for (const db of first.slice(2)) {
      g.level(db);
      expect(g.open).toBe(false);
    }
    for (const db of strum().slice(0, 2)) g.level(db);
    expect(g.open).toBe(true);
  });

  it('opens on the tracker’s onset of a later strum, not on the counted chord’s own', () => {
    const g = new StrumGate();
    g.close(2.0, -12);
    g.onset(1.8); // the pluck of the chord just counted
    g.onset(2.01);
    expect(g.open).toBe(false);
    // A quick strum whose ring has hardly faded: the level alone would not tell, the onset does.
    g.level(-12.5);
    g.onset(2.34);
    expect(g.open).toBe(true);
  });

  it('does not take the rest of the counted chord’s own attack for a new strum', () => {
    const g = new StrumGate();
    g.close(1, -20);
    for (const db of [-15, -12, -11, -12, -13]) g.level(db);
    expect(g.open).toBe(false);
  });

  it('opens again after a reset, and ignores frames without a level', () => {
    const g = new StrumGate();
    g.close(1, -12);
    g.level(Number.NEGATIVE_INFINITY);
    g.level(Number.NaN);
    expect(g.open).toBe(false);
    g.reset();
    expect(g.open).toBe(true);
  });

  // Review: with a fake microphone strumming G once, wait mode on Frère Jacques went from note 1
  // to note 69 in a few seconds: every chroma frame of the ringing chord matched the next G.
  it('makes wait mode take one strum per chord of a strum-along part', () => {
    const song = sixTab('title: T\ntempo: 90\ntime: 4/4\n\ntrack: Strum\nrole: rhythm\n| "G" q D D D D | D D D D ||\n');
    const targets = practiceTargets(flattenSong(song), song.tracks[0].id);
    const wait = new WaitMode(targets, { toleranceCents: 50 });
    const gate = new StrumGate();
    const G = [0, 0, 0.6, 0, 0, 0, 0, 1, 0, 0, 0, 0.8];
    let t = 0;
    const play = (levels: number[]) => {
      gate.onset(t + 0.01);
      for (const db of levels) {
        t += 0.05;
        gate.level(db);
        if (!gate.open) continue;
        if (wait.hearChroma({ time: t, chroma: G, bass: 7 }).kind === 'match') gate.close(t, db);
      }
    };
    play(strum());
    expect(wait.index).toBe(1);
    play(strum());
    play(strum());
    expect(wait.index).toBe(3);
  });
});
