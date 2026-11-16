import { describe, expect, it } from 'vitest';
import { chordCandidates, chordSpec, judgeStrum, LISTEN_S, SETTLE_S, STRUM_RISE_DB, StrumListener, strumWords } from './heard-chord';

/** A chroma frame with these pitch classes sounding (strength 1, or as given). */
function frame(pcs: Record<number, number> | number[]): number[] {
  const out = new Array<number>(12).fill(0.02);
  if (Array.isArray(pcs)) for (const pc of pcs) out[pc] = 1;
  else for (const [pc, v] of Object.entries(pcs)) out[Number(pc)] = v;
  return out;
}

const C = [0, 4, 7];
const G = [7, 11, 2];
const AM = [9, 0, 4];
const want = chordSpec('G')!;
const candidates = chordCandidates(['G', 'C', 'D', 'Em']);
const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

describe('chordSpec and candidates', () => {
  it('reads the pitch classes and bass of a symbol', () => {
    expect(chordSpec('G')).toMatchObject({ name: 'G', bass: 7 });
    expect(new Set(chordSpec('G')!.pcs)).toEqual(new Set(G));
    expect(chordSpec('C/E')).toMatchObject({ bass: 4 });
    expect(chordSpec('N.C.')).toBeNull();
    expect(chordSpec('not a chord')).toBeNull();
  });

  it('puts the song’s own chords first and never repeats a pitch-class set', () => {
    const list = chordCandidates(['Em', 'G', 'G']);
    expect(list[0].name).toBe('Em');
    expect(list[1].name).toBe('G');
    expect(list.length).toBe(24);
  });
});

describe('judgeStrum', () => {
  it('names the chord heard when it is clearly another one', () => {
    expect(judgeStrum(frame(C), want, candidates)).toEqual({ kind: 'other', heard: 'C' });
    expect(judgeStrum(frame(AM), want, candidates)).toMatchObject({ kind: 'other', heard: 'Am' });
  });

  it('says "nearly" for the right chord with a string missing', () => {
    const v = judgeStrum(frame({ 7: 1, 11: 0.9, 2: 0.05 }), want, candidates);
    expect(v.kind).toBe('close');
    expect(v.kind !== 'other' && v.missing).toEqual([2]);
  });

  it('does not invent a chord from noise', () => {
    expect(judgeStrum(frame([]), want, candidates).kind).toBe('unclear');
  });
});

describe('StrumListener', () => {
  it('listens after the attack and judges each strum once', () => {
    const l = new StrumListener();
    l.onset(10);
    expect(l.frame(10.05, frame(C), want, candidates)).toBeNull(); // still the attack
    expect(l.frame(10 + SETTLE_S + 0.05, frame(C), want, candidates)).toBeNull();
    expect(l.frame(10 + SETTLE_S + 0.2, frame(C), want, candidates)).toBeNull();
    const v = l.frame(10 + SETTLE_S + LISTEN_S + 0.02, frame(C), want, candidates);
    expect(v).toEqual({ kind: 'other', heard: 'C' });
    // Once judged, the ringing chord says nothing more...
    expect(l.frame(11, frame(C), want, candidates)).toBeNull();
    // ...until the next strum.
    l.onset(12);
    l.frame(12 + SETTLE_S + 0.05, frame(AM), want, candidates);
    l.frame(12 + SETTLE_S + 0.15, frame(AM), want, candidates);
    expect(l.frame(12 + SETTLE_S + LISTEN_S + 0.02, frame(AM), want, candidates)).toMatchObject({ kind: 'other', heard: 'Am' });
  });

  it('treats onsets inside one strum as the same strum, and forgets a strum that matched', () => {
    const l = new StrumListener();
    l.onset(5);
    l.onset(5.03); // the next string of the same strum
    l.frame(5 + SETTLE_S + 0.05, frame(C), want, candidates);
    l.frame(5 + SETTLE_S + 0.1, frame(C), want, candidates);
    expect(l.frame(5 + SETTLE_S + LISTEN_S + 0.01, frame(C), want, candidates)).not.toBeNull();
    l.onset(7);
    l.frame(7 + SETTLE_S + 0.05, frame(G), want, candidates);
    l.cancel(); // the chord matched
    expect(l.frame(7 + SETTLE_S + LISTEN_S + 0.01, frame(G), want, candidates)).toBeNull();
  });

  it('says nothing without a strum', () => {
    expect(new StrumListener().frame(3, frame(C), want, candidates)).toBeNull();
  });

  it('says nothing about an onset that brings no new sound (the last chord dying away, then a click)', () => {
    const l = new StrumListener();
    // A C chord ringing out, about -45 dB and falling, fed between strums.
    let t = 40;
    for (let i = 0; i < 6; i++, t += 0.05) l.frame(t, frame(C), want, candidates, -45 - i * 0.3);
    l.onset(t);
    const start = t;
    for (const dt of [0.15, 0.25, 0.35]) expect(l.frame(start + dt, frame(C), want, candidates, -47 - dt)).toBeNull();
    expect(l.frame(start + SETTLE_S + LISTEN_S + 0.02, frame(C), want, candidates, -48)).toBeNull();
    // A real strum rises well above what was ringing: it is judged.
    t = start + 1;
    for (let i = 0; i < 4; i++, t += 0.05) l.frame(t, frame([]), want, candidates, -50);
    l.onset(t);
    l.frame(t + SETTLE_S + 0.05, frame(AM), want, candidates, -50 + STRUM_RISE_DB + 20);
    l.frame(t + SETTLE_S + 0.15, frame(AM), want, candidates, -50 + STRUM_RISE_DB + 18);
    expect(l.frame(t + SETTLE_S + LISTEN_S + 0.02, frame(AM), want, candidates, -36)).toMatchObject({ kind: 'other', heard: 'Am' });
  });

  it('says nothing about an onset followed by silence (strings muted, a knock, a click)', () => {
    // The pitch tracker reports frames below its gate as all zeros.
    const quiet = new Array<number>(12).fill(0);
    const l = new StrumListener();
    l.onset(30);
    for (const dt of [0.05, 0.1, 0.2, 0.3]) expect(l.frame(30 + SETTLE_S + dt, quiet, want, candidates)).toBeNull();
    expect(l.frame(30 + SETTLE_S + LISTEN_S + 0.02, quiet, want, candidates)).toBeNull();
    // A real strum after it is still judged.
    l.onset(32);
    l.frame(32 + SETTLE_S + 0.05, frame(C), want, candidates);
    l.frame(32 + SETTLE_S + 0.15, frame(C), want, candidates);
    expect(l.frame(32 + SETTLE_S + LISTEN_S + 0.02, frame(C), want, candidates)).toEqual({ kind: 'other', heard: 'C' });
  });
});

describe('strumWords', () => {
  const show = (s: string) => s.replace('b', '♭');
  const note = (pc: number) => names[pc];
  it('is kind and specific', () => {
    expect(strumWords({ kind: 'other', heard: 'Am' }, 'C', show, note)).toBe('That sounded like Am. The chart says C: give it another go.');
    expect(strumWords({ kind: 'other', heard: 'Am' }, null, show, note)).toBe('That sounded like Am, not the chord here. Have another go, or tap Show me.');
    expect(strumWords({ kind: 'close', missing: [2] }, 'G', show, note)).toBe('Nearly G. The D did not ring out. Strum it again.');
    expect(strumWords({ kind: 'unclear', missing: [7, 11] }, 'G', show, note)).toBe('Not G yet. G and B did not ring out. Check each string rings, then strum again.');
    expect(strumWords({ kind: 'close', missing: [] }, 'G', show, note)).toBe('Nearly G. One string did not ring clearly. Strum it again.');
  });
});
