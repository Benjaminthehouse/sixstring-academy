import { describe, expect, it } from 'vitest';
import {
  arrangeBacking, bassHome, chordFromIntervals, chordIntervals, guitarVoicing, isChordTone, keysVoicing, layoutProgression, powerChord, styleQuarterBpm,
  type BackingArrangement, type BackingBar, type BassEvent, type ChordSegment, type DrumEvent, type GuitarEvent, type KeysEvent,
} from './backing';
import { BackingBand, type BandOutput } from './backing-band';
import { BACKING_STYLES, BACKING_STYLE_IDS } from './backing-styles';
import { DRUM_NAMES } from './percussion';
import { resolveMeter } from './timeline';
import type { TransportClock } from './transport';

const pc = (n: number): number => ((n % 12) + 12) % 12;
const maj = (root: number, symbol: string) => chordFromIntervals(root, [4, 7], symbol);
const min = (root: number, symbol: string) => chordFromIntervals(root, [3, 7], symbol);
const dom7 = (root: number, symbol: string) => chordFromIntervals(root, [4, 7, 10], symbol);
const maj7 = (root: number, symbol: string) => chordFromIntervals(root, [4, 7, 11], symbol);
const min7 = (root: number, symbol: string) => chordFromIntervals(root, [3, 7, 10], symbol);

const C = maj(0, 'C'), G = maj(7, 'G'), Am = min(9, 'Am'), F = maj(5, 'F');
const A7 = dom7(9, 'A7'), D7 = dom7(2, 'D7'), E7 = dom7(4, 'E7');
const Dm7 = min7(2, 'Dm7'), G7 = dom7(7, 'G7'), Cmaj7 = maj7(0, 'Cmaj7'), Am7 = min7(9, 'Am7');

/** Progressions that between them cover triads, sevenths, two chords a bar, odd qualities and slash chords. */
const PROGRESSIONS: Record<string, BackingBar[]> = {
  'I-V-vi-IV': [C, G, Am, F],
  'twelve-bar blues': [A7, D7, A7, A7, D7, D7, A7, A7, E7, D7, A7, E7],
  'ii-V-I with a turnaround': [Dm7, G7, Cmaj7, [Am7, D7]],
  'two and four chords a bar': [[C, Am], [F, G], [C, null, F, G], C],
  'colours': [
    chordFromIntervals(4, [3, 6], 'Edim'), chordFromIntervals(5, [4, 8], 'Faug'), chordFromIntervals(7, [5, 7], 'Gsus4'),
    chordFromIntervals(2, [3, 6, 10], 'Dm7b5'), chordFromIntervals(0, [4, 7, 10, 14], 'C9'), chordFromIntervals(0, [4, 7], 'C/E', 4),
    chordFromIntervals(11, [3, 6, 9], 'Bdim7'), chordFromIntervals(10, [4, 7, 9], 'Bb6'),
  ],
  'minor with a held chord': [min(4, 'Em'), null, maj(0, 'C'), maj(11, 'B')],
};

function segAt(a: BackingArrangement, tick: number): ChordSegment | null {
  for (const s of a.chords) if (s.startTick <= tick && tick < s.endTick) return s;
  return null;
}

describe('laying out a progression', () => {
  const style = BACKING_STYLES['pop-rock'];

  it('one chord per bar, and null continues the previous chord', () => {
    const segs = layoutProgression([C, null, G], style);
    expect(segs.map((s) => [s.chord.symbol, s.startTick, s.endTick, s.bar])).toEqual([['C', 0, 3840, 0], ['C', 3840, 7680, 1], ['G', 7680, 11520, 2]]);
  });

  it('splits a bar evenly, per beat, or at given beats', () => {
    expect(layoutProgression([[C, G]], style).map((s) => [s.chord.symbol, s.startTick, s.endTick])).toEqual([['C', 0, 1920], ['G', 1920, 3840]]);
    expect(layoutProgression([[C, G, Am, F]], style).map((s) => s.startTick)).toEqual([0, 960, 1920, 2880]);
    // Per-beat data with repeats merges into longer chords.
    expect(layoutProgression([[C, C, C, G]], style).map((s) => [s.chord.symbol, s.endTick - s.startTick])).toEqual([['C', 2880], ['G', 960]]);
    expect(layoutProgression([[C, null, null, G]], style).map((s) => [s.chord.symbol, s.endTick - s.startTick])).toEqual([['C', 2880], ['G', 960]]);
    expect(layoutProgression([[{ beat: 0, chord: C }, { beat: 3, chord: G }]], style).map((s) => [s.chord.symbol, s.startTick, s.beat])).toEqual([['C', 0, 0], ['G', 2880, 3]]);
    // Three chords in four beats: the first gets the spare beat.
    expect(layoutProgression([[C, F, G]], style).map((s) => s.endTick - s.startTick)).toEqual([1920, 960, 960]);
  });

  it('uses the felt beats of the style', () => {
    const six = BACKING_STYLES['ballad-68'];
    expect(layoutProgression([[C, G]], six).map((s) => [s.startTick, s.endTick])).toEqual([[0, 1440], [1440, 2880]]);
    const waltz = BACKING_STYLES.waltz;
    expect(layoutProgression([[C, G]], waltz).map((s) => s.endTick - s.startTick)).toEqual([1920, 960]);
    const slow = BACKING_STYLES['slow-blues'];
    expect(layoutProgression([[A7, D7]], slow).map((s) => [s.startTick, s.endTick])).toEqual([[0, 2880], [2880, 5760]]);
  });
});

describe('voicings', () => {
  it('the bass home note is the lowest root from E1', () => {
    expect(bassHome(maj(4, 'E'))).toBe(28);
    expect(bassHome(maj(9, 'A'))).toBe(33);
    expect(bassHome(maj(0, 'C'))).toBe(36);
    expect(bassHome(maj(3, 'Eb'))).toBe(39);
    expect(bassHome(chordFromIntervals(0, [4, 7], 'C/G', 7))).toBe(31);
  });

  it('guitar voicings are barre shapes made only of chord tones', () => {
    expect(guitarVoicing(maj(4, 'E'))).toEqual({ midis: [40, 47, 52, 56, 59, 64], strings: [6, 5, 4, 3, 2, 1] });
    expect(guitarVoicing(min(9, 'Am'))).toEqual({ midis: [45, 52, 57, 60, 64], strings: [5, 4, 3, 2, 1] });
    expect(guitarVoicing(dom7(7, 'G7')).midis).toEqual([43, 50, 53, 59, 62, 67]);
    expect(guitarVoicing(maj(0, 'C')).midis).toEqual([48, 55, 60, 64, 67]);
    expect(powerChord(maj(4, 'E'))).toEqual({ midis: [40, 47, 52], strings: [6, 5, 4] });
    expect(powerChord(maj(2, 'D'))).toEqual({ midis: [50, 57, 62], strings: [5, 4, 3] });
    for (let root = 0; root < 12; root++) {
      for (const chord of [maj(root, 'M'), min(root, 'm'), dom7(root, '7'), maj7(root, 'maj7'), min7(root, 'm7'), chordFromIntervals(root, [3, 6], 'dim'), chordFromIntervals(root, [5, 7], 'sus4'), chordFromIntervals(root, [4, 7], 'slash', root + 4)]) {
        const v = guitarVoicing(chord);
        expect(v.midis.length).toBe(v.strings.length);
        for (let i = 0; i < v.midis.length; i++) {
          expect(isChordTone(chord, v.midis[i])).toBe(true);
          if (i > 0) expect(v.midis[i]).toBeGreaterThan(v.midis[i - 1]);
        }
        expect(v.midis[0]).toBeGreaterThanOrEqual(40);
        expect(v.midis[v.midis.length - 1]).toBeLessThanOrEqual(76);
        expect(new Set(v.strings).size).toBe(v.strings.length);
        expect(v.midis.map((m) => pc(m))).toContain(pc(chord.root));
      }
    }
  });

  it('keys voicings stay in the middle register and move smoothly', () => {
    const first = keysVoicing(C, 'close');
    expect(first.length).toBe(3);
    for (const m of first) expect(isChordTone(C, m)).toBe(true);
    const next = keysVoicing(F, 'close', first);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(Math.abs(mean(next) - mean(first))).toBeLessThan(3.1);
    for (const kind of ['close', 'rootless', 'power'] as const) {
      for (let root = 0; root < 12; root++) {
        for (const chord of [maj(root, 'M'), min7(root, 'm7'), dom7(root, '7'), chordFromIntervals(root, [4, 7, 10, 14, 21], '13')]) {
          const v = keysVoicing(chord, kind);
          expect(v.length).toBeGreaterThanOrEqual(2);
          expect(v.length).toBeLessThanOrEqual(4);
          for (const m of v) expect(isChordTone(chord, m)).toBe(true);
          expect(Math.min(...v)).toBeGreaterThanOrEqual(43);
          expect(Math.max(...v)).toBeLessThanOrEqual(84);
        }
      }
    }
    // Rootless voicings leave the root to the bass.
    expect(keysVoicing(Dm7, 'rootless').map(pc)).not.toContain(2);
    expect(keysVoicing(Dm7, 'power').map(pc).sort((a, b) => a - b)).toEqual([2, 9]);
    expect(chordIntervals(G7)).toEqual([0, 4, 7, 10]);
  });
});

describe('arrangements in every style', () => {
  for (const id of BACKING_STYLE_IDS) {
    const style = BACKING_STYLES[id];
    const meter = resolveMeter(style.timeSignature);

    it(`${id}: patterns fit the bar`, () => {
      expect(meter.barTicks).toBe(style.beatsPerBar * style.beatTicks);
      expect(Number.isInteger(meter.barTicks / style.grid)).toBe(true);
      const drumBars = [...style.drums, ...style.fills];
      for (const bar of drumBars) {
        for (const name of Object.keys(bar)) {
          expect(DRUM_NAMES).toContain(name);
          expect(bar[name as keyof typeof bar]!.length, `${id} ${name}`).toBe(style.grid);
          expect(bar[name as keyof typeof bar]!).toMatch(/^[Xxo.]+$/);
        }
      }
      for (const p of [...style.bass, ...(style.bassTurn ? [style.bassTurn] : [])]) {
        expect(p.length, `${id} bass`).toBe(style.grid);
        expect(p).toMatch(/^[Rr35v76QAaNW.\-]+$/);
        // A passing sixth must step down to a fifth.
        for (let i = 0; i < p.length; i++) if (p[i] === '6') expect(p.slice(i + 1).replace(/[.\-]/g, '')[0]).toBe('5');
      }
      for (const p of style.keys) {
        expect(p.length, `${id} keys`).toBe(style.grid);
        expect(p).toMatch(/^[Ccs1-4.\-]+$/);
      }
      for (const p of style.guitar) {
        expect(p.length, `${id} guitar`).toBe(style.grid);
        expect(p).toMatch(/^[DdUuxBPMA1-6.\-]+$/);
      }
      expect(style.tempo.min).toBeLessThan(style.tempo.default);
      expect(style.tempo.max).toBeGreaterThan(style.tempo.default);
    });

    for (const [name, bars] of Object.entries(PROGRESSIONS)) {
      it(`${id}: "${name}" is well formed, and the bass and chords fit the harmony`, () => {
        const a = arrangeBacking(bars, { style: id, choruses: 2, seed: 7 });
        expect(a.barTicks).toBe(meter.barTicks);
        expect(a.chorusBars).toBe(bars.length);
        expect(a.bars).toBe(bars.length * 2 + 1);
        expect(a.bodyTicks).toBe(bars.length * 2 * meter.barTicks);
        expect(a.lengthTicks).toBe(a.bars * meter.barTicks);
        expect(a.chords[a.chords.length - 1].ending).toBe(true);
        // Chords tile the whole arrangement with no gaps or overlaps.
        let cursor = 0;
        for (const seg of a.chords) {
          expect(seg.startTick).toBe(cursor);
          expect(seg.endTick).toBeGreaterThan(seg.startTick);
          expect(Math.floor(seg.startTick / a.barTicks)).toBe(seg.bar);
          expect(seg.endTick).toBeLessThanOrEqual((seg.bar + 1) * a.barTicks);
          cursor = seg.endTick;
        }
        expect(cursor).toBe(a.lengthTicks);

        const stepTicks = a.barTicks / style.grid;
        let prevTick = 0;
        const perBar = new Map<string, number>();
        for (const e of a.events) {
          expect(e.tick).toBeGreaterThanOrEqual(prevTick);
          prevTick = e.tick;
          expect(e.tick).toBeGreaterThanOrEqual(0);
          expect(e.tick).toBeLessThan(a.lengthTicks);
          expect(Math.floor(e.tick / a.barTicks)).toBe(e.bar);
          expect(Math.abs(e.tick / stepTicks - Math.round(e.tick / stepTicks))).toBeLessThan(1e-9);
          expect(e.velocity).toBeGreaterThan(0);
          expect(e.velocity).toBeLessThanOrEqual(1);
          perBar.set(`${e.type}:${e.bar}`, (perBar.get(`${e.type}:${e.bar}`) ?? 0) + 1);
        }
        // Everybody plays in every bar (a band without a drummer has no drums; a style whose keys
        // part is all rests, such as the rumba, has no keys at all, not even on the last chord).
        const keysSilent = style.keys.every((p) => /^[.\-]+$/.test(p));
        const players = ['drum', 'bass', 'keys', 'guitar'].filter((t) => !(t === 'drum' && style.percussion === false) && !(t === 'keys' && keysSilent));
        for (let bar = 0; bar < a.bars; bar++) {
          for (const type of players) expect(perBar.get(`${type}:${bar}`) ?? 0, `${type} in bar ${bar}`).toBeGreaterThan(0);
        }
        if (keysSilent) expect(a.events.some((e) => e.type === 'keys')).toBe(false);

        // --- bass ---------------------------------------------------------------------------
        const bass = a.events.filter((e): e is BassEvent => e.type === 'bass');
        bass.forEach((n, i) => {
          const seg = segAt(a, n.tick)!;
          expect(seg, `bass note at ${n.tick} has a chord`).not.toBeNull();
          expect(n.midi).toBeGreaterThanOrEqual(28);
          expect(n.midi).toBeLessThanOrEqual(57);
          expect(n.duration).toBeGreaterThan(0);
          const next = bass[i + 1];
          const label = `${id} bar ${n.bar} tick ${n.tick} ${n.role} midi ${n.midi} over ${seg.chord.symbol}`;
          if (n.role === 'root') {
            expect(pc(n.midi), label).toBe(pc(seg.chord.bass ?? seg.chord.root));
          } else if (n.role === 'chord') {
            expect(isChordTone(seg.chord, n.midi), label).toBe(true);
          } else if (n.role === 'anticipation') {
            // The next chord's root, played early.
            const later = a.chords[a.chords.indexOf(seg) + 1];
            expect(later, label).toBeDefined();
            expect(pc(n.midi), label).toBe(pc(later.chord.bass ?? later.chord.root));
          } else {
            // Approach and passing notes resolve by step into a chord tone.
            expect(next, label).toBeDefined();
            const step = Math.abs(next.midi - n.midi);
            expect(step, label).toBeGreaterThanOrEqual(1);
            expect(step, label).toBeLessThanOrEqual(2);
            const target = segAt(a, next.tick)!;
            expect(isChordTone(target.chord, next.midi), `${label} -> ${next.midi} over ${target.chord.symbol}`).toBe(true);
            if (n.role === 'approach') expect(pc(next.midi), label).toBe(pc(target.chord.bass ?? target.chord.root));
          }
        });
        // The line never sits on non-chord tones: they come one at a time, between chord tones,
        // and chord tones are the larger part of it.
        const offChord = bass.map((n) => !isChordTone(segAt(a, n.tick)!.chord, n.midi));
        for (let i = 1; i < offChord.length; i++) expect(offChord[i] && offChord[i - 1], `two non-chord tones in a row at bass note ${i}`).toBe(false);
        expect(offChord.filter((o) => !o).length / bass.length).toBeGreaterThan(0.55);
        for (const n of bass) expect(n.level).toBe(style.bassLevel ?? 1);
        // The ending is one long root.
        const last = bass[bass.length - 1];
        expect(last.tick).toBe(a.bodyTicks);
        expect(last.role).toBe('root');
        expect(last.duration).toBe(a.barTicks);

        // --- keys and guitar ----------------------------------------------------------------
        for (const e of a.events) {
          if (e.type !== 'keys' && e.type !== 'guitar') continue;
          const seg = segAt(a, e.tick)!;
          expect(e.midis.length).toBeGreaterThan(0);
          for (const m of e.midis) expect(isChordTone(seg.chord, m), `${e.type} ${m} over ${seg.chord.symbol} in bar ${e.bar}`).toBe(true);
          if (e.type === 'guitar') {
            expect(e.strings.length).toBe(e.midis.length);
            for (const s of e.strings) {
              expect(s).toBeGreaterThanOrEqual(1);
              expect(s).toBeLessThanOrEqual(6);
            }
            for (let i = 1; i < e.midis.length; i++) expect(e.midis[i]).toBeGreaterThan(e.midis[i - 1]);
            expect(e.midis[0]).toBeGreaterThanOrEqual(40);
          } else {
            expect(Math.min(...e.midis)).toBeGreaterThanOrEqual(43);
            expect(Math.max(...e.midis)).toBeLessThanOrEqual(88);
          }
        }
      });
    }

    it(`${id}: fills end each chorus, a crash opens the next, and the band ends together`, () => {
      const bars = PROGRESSIONS['twelve-bar blues'];
      const a = arrangeBacking(bars, { style: id, choruses: 2, seed: 3 });
      const drums = a.events.filter((e) => e.type === 'drum');
      const drummer = style.percussion !== false;
      const keyboard = !style.keys.every((p) => /^[.\-]+$/.test(p));
      const ending = a.events.filter((e) => e.bar === 24);
      expect(ending.every((e) => e.tick === a.bodyTicks)).toBe(true);
      const players = ['bass', ...(drummer ? ['drum', 'drum'] : []), 'guitar', ...(keyboard ? ['keys'] : [])].sort();
      expect(ending.map((e) => e.type).sort()).toEqual(players);
      if (!drummer) {
        expect(drums).toEqual([]);
        return;
      }
      const fillBars = new Set(drums.filter((e) => e.fill).map((e) => e.bar));
      expect(fillBars.has(11)).toBe(true);
      expect(fillBars.has(23)).toBe(true);
      // Twelve bars: light fills at bars 4 and 8 as well, nowhere else.
      expect([...fillBars].sort((x, y) => x - y)).toEqual([3, 7, 11, 15, 19, 23]);
      const crashes = drums.filter((e) => e.drum === 'crash').map((e) => e.tick);
      expect(crashes).toEqual([0, 12 * a.barTicks, 24 * a.barTicks]);
      const without = arrangeBacking(bars, { style: id, fills: false, ending: false, choruses: 1 });
      expect(without.events.some((e) => e.type === 'drum' && e.fill)).toBe(false);
      expect(without.bars).toBe(12);
      expect(without.hasEnding).toBe(false);
    });

    it(`${id}: the same seed gives the same arrangement`, () => {
      const bars = PROGRESSIONS['ii-V-I with a turnaround'];
      const a = arrangeBacking(bars, { style: id, seed: 11 });
      const b = arrangeBacking(bars, { style: id, seed: 11 });
      expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    });
  }

  it('a different seed changes the walking bass line', () => {
    const bars = PROGRESSIONS['ii-V-I with a turnaround'];
    const line = (seed: number) => arrangeBacking(bars, { style: 'jazz-swing', seed, choruses: 4 }).events.filter((e): e is BassEvent => e.type === 'bass').map((e) => e.midi).join(',');
    expect(line(1)).not.toBe(line(2));
  });

  it('characteristic details of the styles', () => {
    const blues = PROGRESSIONS['twelve-bar blues'];
    const drumsAt = (a: BackingArrangement, bar: number, drum: string): number[] =>
      a.events.filter((e) => e.type === 'drum' && e.bar === bar && e.drum === drum).map((e) => (e.tick - bar * a.barTicks) / (a.barTicks / BACKING_STYLES[a.style].grid));
    // Backbeat on 2 and 4.
    expect(drumsAt(arrangeBacking([C, G, Am, F], { style: 'pop-rock' }), 1, 'snare')).toEqual([4, 12]);
    // One-drop: kick and rim together on beat 3, nothing on beat 1.
    const reggae = arrangeBacking([C, G, Am, F], { style: 'reggae' });
    expect(drumsAt(reggae, 2, 'kick')).toEqual([8]);
    expect(drumsAt(reggae, 2, 'sidestick')).toEqual([8]);
    // Not even in the first bar or after a fill, where the other styles put a kick under the crash.
    for (let bar = 0; bar < reggae.bars - 1; bar++) expect(drumsAt(reggae, bar, 'kick').includes(0), `reggae kick on beat one of bar ${bar}`).toBe(false);
    expect(drumsAt(reggae, 0, 'crash')).toEqual([0]);
    expect(drumsAt(arrangeBacking([C, G, Am, F], { style: 'latin' }), 0, 'kick').includes(0)).toBe(true);
    // Shuffle: the hi-hat plays the first and third triplet of every beat.
    expect(drumsAt(arrangeBacking(blues, { style: 'blues-shuffle' }), 1, 'hihatClosed')).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
    // Swing: ride "ding, ding-a-ding", hi-hat foot on 2 and 4, a bass note on every beat.
    const jazz = arrangeBacking(PROGRESSIONS['ii-V-I with a turnaround'], { style: 'jazz-swing' });
    expect(drumsAt(jazz, 1, 'ride')).toEqual([0, 3, 5, 6, 9, 11]);
    expect(drumsAt(jazz, 1, 'hihatPedal')).toEqual([3, 9]);
    const walking = jazz.events.filter((e): e is BassEvent => e.type === 'bass' && e.bar < 8);
    expect(walking.length).toBe(32);
    walking.forEach((n, i) => expect(n.tick).toBe(i * 960));
    // Every chord arrival gets its root.
    for (const seg of jazz.chords) {
      const first = jazz.events.find((e): e is BassEvent => e.type === 'bass' && e.tick === seg.startTick)!;
      expect(pc(first.midi)).toBe(pc(seg.chord.root));
    }
    // Waltz: bass on one, chords on two and three.
    const waltz = arrangeBacking([C, C, G, G], { style: 'waltz' });
    const waltzKeys = waltz.events.filter((e) => e.type === 'keys' && e.bar === 0).map((e) => e.tick);
    expect(waltzKeys).toEqual([960, 1920]);
    const waltzBass = waltz.events.filter((e): e is BassEvent => e.type === 'bass' && e.bar < 4 && e.tick % waltz.barTicks === 0);
    // Root, then the fifth while the chord stays, then the new root.
    expect(waltzBass.map((n) => pc(n.midi))).toEqual([0, 7, 7, 2]);
    // Metal: palm-muted chugs and open accents on the driven guitar; the bass doubles in eighths.
    const metal = arrangeBacking([min(4, 'Em'), maj(0, 'C')], { style: 'metal' });
    const chugs = metal.events.filter((e): e is GuitarEvent => e.type === 'guitar' && e.bar === 0);
    expect(chugs.map((g) => g.articulation === 'palm-mute')).toEqual([false, true, true, false, true, true, false, true]);
    expect(chugs.every((g) => g.tone === 'driven')).toBe(true);
    expect(metal.events.filter((e) => e.type === 'bass' && e.bar === 0).length).toBe(8);
    // Bossa: the bass anticipates the next bar's root on the last eighth.
    const bossa = arrangeBacking([Dm7, G7, Cmaj7, Cmaj7], { style: 'bossa' });
    const lastOfBar0 = bossa.events.filter((e): e is BassEvent => e.type === 'bass' && e.bar === 0).pop()!;
    expect(lastOfBar0.role).toBe('anticipation');
    expect(pc(lastOfBar0.midi)).toBe(7);
    expect(lastOfBar0.tick).toBe(14 * 240);
    // 6/8 and 12/8 use the compound bar.
    expect(arrangeBacking([C, G], { style: 'ballad-68' }).barTicks).toBe(2880);
    expect(arrangeBacking([A7, D7], { style: 'slow-blues' }).barTicks).toBe(5760);
    expect(styleQuarterBpm('slow-blues', 60)).toBe(90);
    expect(styleQuarterBpm('funk', 100)).toBe(100);
  });

  it('rejects an unknown style', () => {
    expect(() => arrangeBacking([C], { style: 'polka' as never })).toThrow();
  });
});

describe('musicality, by inspection of the generated events', () => {
  const m7b5 = (root: number, symbol: string) => chordFromIntervals(root, [3, 6, 10], symbol);
  const dim7 = (root: number, symbol: string) => chordFromIntervals(root, [3, 6, 9], symbol);
  const JAZZ: Record<string, BackingBar[]> = {
    'ii-V-I': [Dm7, G7, Cmaj7, Cmaj7],
    'jazz blues in F': [dom7(5, 'F7'), dom7(10, 'Bb7'), dom7(5, 'F7'), [min7(0, 'Cm7'), dom7(5, 'F7')], dom7(10, 'Bb7'), dim7(11, 'Bdim7'), dom7(5, 'F7'), [Am7, D7], min7(7, 'Gm7'), dom7(0, 'C7'), [dom7(5, 'F7'), D7], [min7(7, 'Gm7'), dom7(0, 'C7')]],
    'rhythm changes': [[maj7(10, 'Bbmaj7'), min7(7, 'Gm7')], [min7(0, 'Cm7'), dom7(5, 'F7')], [Dm7, G7], [min7(0, 'Cm7'), dom7(5, 'F7')], [dom7(10, 'Bb7'), dom7(10, 'Bb7')], [dom7(3, 'Eb7'), dim7(4, 'Edim7')], [maj7(10, 'Bbmaj7'), dom7(5, 'F7')], maj7(10, 'Bbmaj7')],
    'minor ii-V': [Am7, m7b5(11, 'Bm7b5'), E7, Am7, Dm7, G7, Cmaj7, E7],
    'one chord for four bars': [Dm7, null, null, null, min7(3, 'Ebm7'), null, null, null],
  };
  const stepOf = (a: BackingArrangement): number => a.barTicks / BACKING_STYLES[a.style].grid;
  const hits = (a: BackingArrangement, bar: number, drum: string): number[] =>
    a.events.filter((e) => e.type === 'drum' && e.bar === bar && e.drum === drum).map((e) => Math.round((e.tick - bar * a.barTicks) / stepOf(a)));

  it('walking bass: a root on every arrival, chord tones on the strong beats, the next root approached by step, a line that moves', () => {
    let notes = 0, repeats = 0, bigLeaps = 0, leapsIntoApproach = 0, approaches = 0, steps = 0;
    let low = 99, high = 0;
    for (const [name, bars] of Object.entries(JAZZ)) {
      for (let seed = 1; seed <= 25; seed++) {
        const a = arrangeBacking(bars, { style: 'jazz-swing', choruses: 2, seed });
        const bass = a.events.filter((e): e is BassEvent => e.type === 'bass');
        // Four to the bar, on the beat, nothing between.
        expect(bass.filter((n) => n.bar < a.bars - 1).length, name).toBe((a.bars - 1) * 4);
        for (let i = 0; i < bass.length; i++) {
          const n = bass[i], next = bass[i + 1];
          const seg = segAt(a, n.tick)!;
          const label = `${name} seed ${seed} bar ${n.bar} tick ${n.tick}`;
          notes++;
          low = Math.min(low, n.midi);
          high = Math.max(high, n.midi);
          if (n.bar < a.bars - 1) expect(n.tick % 960, label).toBe(0);
          // The chord arrives: its root.
          if (n.tick === seg.startTick) expect(pc(n.midi), label).toBe(pc(seg.chord.root));
          // Beats one and three: a chord tone.
          if (n.tick % 1920 === 0) expect(isChordTone(seg.chord, n.midi), label).toBe(true);
          if (!next) continue;
          const leap = Math.abs(next.midi - n.midi);
          if (leap === 0) repeats++;
          if (leap > 9) bigLeaps++;
          if (leap <= 2) steps++;
          if (n.role === 'approach') {
            approaches++;
            // By a half step or a whole step into the root of the chord that follows.
            expect(leap, label).toBeGreaterThanOrEqual(1);
            expect(leap, label).toBeLessThanOrEqual(2);
            expect(pc(next.midi), label).toBe(pc(segAt(a, next.tick)!.chord.root));
            expect(next.tick, label).toBe(n.tick + 960);
          }
          if (next.role === 'approach' && leap >= 7) leapsIntoApproach++;
          // The beat before a new chord (or a new bar) is always an approach note.
          const nextSeg = segAt(a, next.tick)!;
          if (next.bar < a.bars - 1 || n.bar < a.bars - 1) {
            if (nextSeg !== seg) expect(n.role, label).toBe('approach');
          }
        }
      }
    }
    expect(notes).toBeGreaterThan(8000);
    expect(approaches).toBeGreaterThan(2000);
    // E1 up to E3: the range of a bass line, never above it.
    expect(low).toBeGreaterThanOrEqual(28);
    expect(high).toBeLessThanOrEqual(52);
    // It walks: mostly steps, hardly ever the same note twice, no jumps of more than a sixth,
    // and it does not leap to the approach note from far away.
    expect(steps / notes).toBeGreaterThan(0.5);
    expect(repeats / notes).toBeLessThan(0.002);
    expect(bigLeaps).toBe(0);
    expect(leapsIntoApproach / approaches).toBeLessThan(0.01);
  });

  it('every other bass style: approach notes resolve by step, the rest of the line is chord tones', () => {
    for (const id of BACKING_STYLE_IDS) {
      const style = BACKING_STYLES[id];
      for (const [name, bars] of Object.entries(JAZZ)) {
        if (style.beatsPerBar !== 4 && bars.some((b) => Array.isArray(b))) continue;
        for (const seed of [1, 2, 3]) {
          const a = arrangeBacking(bars, { style: id, seed });
          const bass = a.events.filter((e): e is BassEvent => e.type === 'bass');
          bass.forEach((n, i) => {
            const seg = segAt(a, n.tick)!;
            const next = bass[i + 1];
            const label = `${id} / ${name} seed ${seed} bar ${n.bar}`;
            expect(n.midi, label).toBeGreaterThanOrEqual(28);
            expect(n.midi, label).toBeLessThanOrEqual(52);
            if (n.role === 'root' || n.role === 'chord') expect(isChordTone(seg.chord, n.midi), label).toBe(true);
            if (n.role === 'approach' && next) {
              expect(Math.abs(next.midi - n.midi), label).toBeGreaterThanOrEqual(1);
              expect(Math.abs(next.midi - n.midi), label).toBeLessThanOrEqual(2);
            }
          });
        }
      }
    }
  });

  it('swing and shuffle: the off-beat is the last triplet of the beat, two to one, never a straight eighth', () => {
    for (const id of ['jazz-swing', 'blues-shuffle'] as const) {
      const style = BACKING_STYLES[id];
      expect(style.grid).toBe(12); // three steps to the beat
      const a = arrangeBacking(PROGRESSIONS['twelve-bar blues'], { style: id, choruses: 2 });
      for (const e of a.events) {
        const inBeat = (e.tick % 960) / 960;
        // On the beat, or two thirds of the way through it (a 2:1 swing ratio), or the middle triplet in a fill.
        const onTriplet = [0, 1 / 3, 2 / 3].some((f) => Math.abs(inBeat - f) < 1e-9);
        expect(onTriplet, `${id} ${e.type} at ${e.tick}`).toBe(true);
        expect(Math.abs(inBeat - 0.5) < 1e-9, `${id}: a straight eighth at ${e.tick}`).toBe(false);
        if (!(e.type === 'drum' && e.fill) && e.type !== 'keys') expect(Math.abs(inBeat - 1 / 3) < 1e-9, `${id} ${e.type}: middle triplet outside a fill at ${e.tick}`).toBe(false);
      }
    }
    // The ride pattern of a plain bar: beats 1 2 3 4 plus the skip notes before 3 and before 1.
    const jazz = arrangeBacking([Dm7, G7, Cmaj7, Am7, Dm7, G7, Cmaj7, Cmaj7], { style: 'jazz-swing' });
    expect(hits(jazz, 1, 'ride')).toEqual([0, 3, 5, 6, 9, 11]);
    expect(hits(jazz, 1, 'hihatPedal')).toEqual([3, 9]);
    // Shuffle: hi-hat on the beat and on its last triplet; backbeat on two and four; kick on one.
    const shuffle = arrangeBacking(PROGRESSIONS['twelve-bar blues'], { style: 'blues-shuffle' });
    expect(hits(shuffle, 1, 'hihatClosed')).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
    expect(hits(shuffle, 1, 'snare')).toEqual([3, 9]);
    expect(hits(shuffle, 1, 'kick')[0]).toBe(0);
    // The slow blues is in 12/8: three eighths to the beat, backbeat on the second and fourth beat.
    const slow = arrangeBacking(PROGRESSIONS['twelve-bar blues'], { style: 'slow-blues' });
    expect(hits(slow, 1, 'hihatClosed')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(hits(slow, 1, 'snare')).toEqual([3, 9]);
  });

  it('reggae: the one is dropped, the chords chop the off-beats, the bass waits for beat two', () => {
    const a = arrangeBacking([Am, Am, Dm7, E7], { style: 'reggae', choruses: 2 });
    for (let bar = 0; bar < a.bars - 1; bar++) {
      const fill = a.events.some((e) => e.type === 'drum' && e.bar === bar && e.fill);
      expect(hits(a, bar, 'kick'), `bar ${bar}`).toEqual([8]);
      expect(hits(a, bar, 'sidestick').includes(8), `bar ${bar}`).toBe(true);
      // Kick and rim are the accent of the bar: nothing else in the kit is hit as hard on beat three.
      const three = a.events.filter((e) => e.type === 'drum' && e.bar === bar && e.tick === bar * a.barTicks + 8 * 240 && (e.drum === 'kick' || e.drum === 'sidestick'));
      expect(three.length).toBe(2);
      for (const e of three) expect(e.velocity).toBeGreaterThan(0.85);
      // The skank: keys and guitar only on the "and" of each beat, and short.
      for (const type of ['keys', 'guitar'] as const) {
        const comp = a.events.filter((e) => e.type === type && e.bar === bar);
        expect(comp.map((e) => (e.tick - bar * a.barTicks) / 240), `${type} bar ${bar}`).toEqual([2, 6, 10, 14]);
        for (const e of comp) if (e.type === 'keys' || e.type === 'guitar') expect(e.duration).toBeLessThan(240);
      }
      // The bass leaves beat one empty.
      const bass = a.events.filter((e) => e.type === 'bass' && e.bar === bar);
      expect(Math.min(...bass.map((e) => e.tick - bar * a.barTicks)), `bass bar ${bar}`).toBe(4 * 240);
      if (!fill) expect(hits(a, bar, 'hihatClosed').length).toBeGreaterThanOrEqual(7);
    }
  });

  it('bossa nova: the two-bar rim clave, straight eighths, root and fifth with the next root anticipated', () => {
    const a = arrangeBacking([Dm7, G7, Cmaj7, Am7, Dm7, G7, Cmaj7, Cmaj7], { style: 'bossa', choruses: 1 });
    // 3-2 clave across two bars: 1, the and of 2, 4 | 2, the and of 3.
    expect(hits(a, 0, 'sidestick')).toEqual([0, 6, 12]);
    expect(hits(a, 1, 'sidestick')).toEqual([4, 10]);
    expect(hits(a, 2, 'sidestick')).toEqual([0, 6, 12]);
    expect(hits(a, 1, 'hihatClosed')).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(hits(a, 1, 'kick')).toEqual([0, 6, 8, 14]);
    // Nothing on a sixteenth: bossa eighths are even.
    for (const e of a.events) expect((e.tick / 240) % 2, `${e.type} at ${e.tick}`).toBe(0);
    const bass = a.events.filter((e): e is BassEvent => e.type === 'bass' && e.bar === 0);
    expect(bass.map((n) => (n.tick / 240))).toEqual([0, 6, 8, 14]);
    expect(bass.map((n) => pc(n.midi))).toEqual([2, 9, 9, 7]); // D, A, A, then G: the next bar's root, early
    expect(bass[3].role).toBe('anticipation');
    // The guitar: thumb on one and three, plucked chords in between.
    const gtr = a.events.filter((e): e is GuitarEvent => e.type === 'guitar' && e.bar === 0);
    expect(gtr.filter((g) => g.midis.length === 1).map((g) => g.tick / 240)).toEqual([0, 8]);
    expect(gtr.every((g) => g.tone === 'nylon')).toBe(true);
  });

  it('fills sit at the ends of sections, replace the groove there, and lead into a crash', () => {
    for (const id of BACKING_STYLE_IDS) {
      const style = BACKING_STYLES[id];
      if (style.percussion === false) continue; // no drummer: see the drummerless styles below
      const a = arrangeBacking(PROGRESSIONS['twelve-bar blues'], { style: id, choruses: 2, seed: 5 });
      const drums = a.events.filter((e) => e.type === 'drum');
      const step = stepOf(a);
      for (const bar of [3, 7, 11, 15, 19, 23]) {
        const full = bar % 12 === 11;
        const from = full ? 0 : Math.floor((style.grid * 3) / 4);
        const inBar = drums.filter((e) => e.bar === bar);
        // From where the fill begins, every hit belongs to it; before that, none does.
        for (const e of inBar) {
          const s = Math.round((e.tick - bar * a.barTicks) / step);
          if (e.type === 'drum') expect(e.fill, `${id} bar ${bar} step ${s} ${e.drum}`).toBe(s >= from);
        }
        expect(inBar.some((e) => e.type === 'drum' && e.fill), `${id} bar ${bar}`).toBe(true);
        // A full fill is answered by a crash on the next downbeat.
        if (full) expect(drums.some((e) => e.type === 'drum' && e.drum === 'crash' && e.tick === (bar + 1) * a.barTicks), `${id} crash after bar ${bar}`).toBe(true);
      }
      // No fill anywhere else.
      const fillBars = new Set(drums.filter((e) => e.type === 'drum' && e.fill).map((e) => e.bar));
      expect([...fillBars].sort((x, y) => x - y)).toEqual([3, 7, 11, 15, 19, 23]);
    }
  });

  it('comping voicings: third and seventh always, no semitone clusters, the root left to the bass when it would rub', () => {
    const chords: Array<[string, number[]]> = [
      ['Cmaj7', [4, 7, 11]], ['Cmaj9', [4, 7, 11, 14]], ['C6/9', [4, 7, 9, 14]], ['C7', [4, 7, 10]], ['C9', [4, 7, 10, 14]], ['C13', [4, 7, 10, 14, 21]],
      ['C7b9', [4, 7, 10, 13]], ['C7#9', [4, 7, 10, 15]], ['C7#11', [4, 7, 10, 18]], ['Cm7', [3, 7, 10]], ['Cm9', [3, 7, 10, 14]], ['Cm11', [3, 7, 10, 14, 17]],
      ['Cm(maj7)', [3, 7, 11]], ['Cm7b5', [3, 6, 10]], ['Cdim7', [3, 6, 9]], ['Cmaj7#11', [4, 7, 11, 18]], ['C7sus4', [5, 7, 10]],
    ];
    for (let root = 0; root < 12; root++) {
      for (const [name, iv] of chords) {
        const chord = chordFromIntervals(root, iv, name);
        const tones = chordIntervals(chord);
        for (const kind of ['close', 'rootless'] as const) {
          let prev: number[] | undefined;
          for (let pass = 0; pass < 3; pass++) {
            const v = keysVoicing(chord, kind, prev);
            const label = `${name} on ${root} (${kind}): ${v.join(' ')}`;
            const ivs = v.map((m) => pc(m - root));
            expect(v.length, label).toBeGreaterThanOrEqual(3);
            expect(v.length, label).toBeLessThanOrEqual(4);
            for (const m of v) expect(isChordTone(chord, m), label).toBe(true);
            // The third (or the suspended fourth) and the seventh are the chord.
            const third = [4, 3, 5].find((t) => tones.includes(t))!;
            const seventh = [10, 11, 9].find((t) => tones.includes(t))!;
            expect(ivs.includes(third), `${label}: third`).toBe(true);
            expect(ivs.includes(seventh), `${label}: seventh`).toBe(true);
            // Never two voices a semitone apart.
            for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1], label).toBeGreaterThan(1);
            // The root goes when it would sit a semitone from the major seventh or the flat ninth,
            // when the chord has five notes or more, and always in a rootless voicing.
            if (tones.includes(11) || tones.includes(1) || tones.length > 4 || kind === 'rootless') expect(ivs.includes(0), `${label}: root`).toBe(false);
            expect(Math.min(...v), label).toBeGreaterThanOrEqual(43);
            expect(Math.max(...v), label).toBeLessThanOrEqual(81);
            prev = v;
          }
        }
      }
    }
    // Triads keep all three notes, root included; power voicings are root and fifth.
    expect(keysVoicing(C, 'close').map(pc).sort((a, b) => a - b)).toEqual([0, 4, 7]);
    expect(keysVoicing(Am, 'rootless').map(pc).sort((a, b) => a - b)).toEqual([0, 4, 9]);
    expect(keysVoicing(Cmaj7, 'power').map(pc).sort((a, b) => a - b)).toEqual([0, 7]);
    // And the hand moves little from chord to chord.
    let prev = keysVoicing(Dm7, 'rootless');
    for (const chord of [G7, Cmaj7, Am7, Dm7, G7, Cmaj7]) {
      const v = keysVoicing(chord, 'rootless', prev);
      const mean = (x: number[]): number => x.reduce((p, c) => p + c, 0) / x.length;
      expect(Math.abs(mean(v) - mean(prev))).toBeLessThan(4);
      prev = v;
    }
  });

  it('the newer styles: rumba, gospel, ska, classical arpeggios and tango each play their idiom', () => {
    const bars = [C, G, Am, F];
    const at = (a: ReturnType<typeof arrangeBacking>, type: string, bar: number, detail?: (e: never) => boolean): number[] =>
      a.events.filter((e) => e.type === type && e.bar === bar && (!detail || detail(e as never))).map((e) => (e.tick - bar * a.barTicks) / (a.barTicks / 16));
    // Rumba: palmas (claps) on 2 and 4 and the off-beats after them; the strum chops (a dead stroke) on 2 and 4.
    const rumba = arrangeBacking(bars, { style: 'rumba', seed: 3 });
    expect(at(rumba, 'drum', 1, (e: DrumEvent) => e.drum === 'clap')).toEqual([4, 6, 12, 14]);
    const rumbaGtr = rumba.events.filter((e): e is GuitarEvent => e.type === 'guitar' && e.bar === 1);
    expect(rumbaGtr.filter((g) => g.articulation === 'dead').map((g) => (g.tick - 3840) / 240)).toEqual([4, 12]);
    expect(rumbaGtr.every((g) => g.tone === 'nylon')).toBe(true);
    // Gospel: claps with the backbeat, an organ, a shuffle grid.
    const gospel = arrangeBacking(bars, { style: 'gospel', seed: 3 });
    const claps = gospel.events.filter((e): e is DrumEvent => e.type === 'drum' && e.drum === 'clap' && e.bar === 1).map((e) => (e.tick - 3840) / 960);
    expect(claps).toEqual([1, 3]);
    expect(gospel.events.filter((e): e is KeysEvent => e.type === 'keys').every((k) => k.voice === 'organ')).toBe(true);
    // Ska: every chord stroke is an up-stroke on an off-beat, and the organ skanks with it.
    const ska = arrangeBacking(bars, { style: 'ska', seed: 3 });
    const skank = ska.events.filter((e): e is GuitarEvent => e.type === 'guitar' && e.bar === 1);
    expect(skank.map((g) => (g.tick - 3840) / 480)).toEqual([1, 3, 5, 7]);
    expect(skank.every((g) => g.direction === 'up')).toBe(true);
    expect(ska.events.filter((e) => e.type === 'keys' && e.bar === 1).map((e) => (e.tick - 3840) / 480)).toEqual([1, 3, 5, 7]);
    // Classical: no drums at all, a fingerpicked arpeggio one string at a time, every note a chord tone, let ring.
    const classical = arrangeBacking(bars, { style: 'classical', seed: 3 });
    expect(classical.events.some((e) => e.type === 'drum')).toBe(false);
    const arp = classical.events.filter((e): e is GuitarEvent => e.type === 'guitar' && e.bar === 1);
    expect(arp).toHaveLength(8);
    expect(arp.every((g) => g.midis.length === 1 && g.duration === 0 && g.tone === 'nylon')).toBe(true);
    for (const g of classical.events.filter((e): e is GuitarEvent => e.type === 'guitar')) {
      const seg = segAt(classical, g.tick)!;
      expect(isChordTone(seg.chord, g.midis[0])).toBe(true);
    }
    // The thumb opens the bar on the lowest string of the shape.
    expect(arp[0].strings[0]).toBeGreaterThanOrEqual(5);
    expect(classical.events.filter((e) => e.type === 'keys' && e.bar === 1).every((e) => (e as KeysEvent).midis.length === 1)).toBe(true);
    // Tango: no drums; a marcato on all four beats, then the 3-3-2 síncopa the next bar.
    const tango = arrangeBacking(bars, { style: 'tango', seed: 3 });
    expect(tango.events.some((e) => e.type === 'drum')).toBe(false);
    expect(at(tango, 'keys', 0)).toEqual([0, 4, 8, 12]);
    expect(at(tango, 'keys', 1)).toEqual([0, 6, 12]);
    expect(at(tango, 'bass', 1)[0]).toBe(0);
    // Every new style has a name, a picker line and a sensible tempo range.
    for (const id of ['rumba', 'gospel', 'ska', 'classical', 'tango'] as const) {
      expect(BACKING_STYLE_IDS).toContain(id);
      expect(BACKING_STYLES[id].name.length).toBeGreaterThanOrEqual(3);
      expect(BACKING_STYLES[id].description.length).toBeGreaterThan(20);
    }
  });

  it('a band without a drummer: no grooves, fills, cymbals or ending hit, but the rest of the band ends together', () => {
    for (const id of BACKING_STYLE_IDS.filter((s) => BACKING_STYLES[s].percussion === false)) {
      const a = arrangeBacking(PROGRESSIONS['twelve-bar blues'], { style: id, choruses: 2, seed: 5 });
      expect(a.events.filter((e) => e.type === 'drum'), id).toEqual([]);
      const last = a.events.filter((e) => e.bar === a.bars - 1);
      expect(last.some((e) => e.type === 'bass'), id).toBe(true);
      expect(last.some((e) => e.type === 'keys'), id).toBe(true);
    }
    expect(BACKING_STYLE_IDS.filter((s) => BACKING_STYLES[s].percussion === false).sort()).toEqual(['classical', 'tango']);
  });

  it('the mix: every style gives each player a level, and none is far from the others', () => {
    for (const id of BACKING_STYLE_IDS) {
      const s = BACKING_STYLES[id];
      for (const level of [s.drumLevel, s.bassLevel ?? 1, s.keysLevel, s.guitarLevel ?? 1]) {
        expect(level, id).toBeGreaterThan(0.3);
        expect(level, id).toBeLessThanOrEqual(2.5);
      }
      const a = arrangeBacking([C, G, Am, F], { style: id });
      for (const e of a.events) {
        if (e.type === 'bass') expect(e.level).toBe(s.bassLevel ?? 1);
        if (e.type === 'keys') expect(e.level).toBe(s.keysLevel);
        if (e.type === 'guitar') expect(e.level).toBe(s.guitarLevel ?? 1);
      }
    }
  });
});

class FakeClock implements TransportClock {
  t = 0;
  now(): number {
    return this.t;
  }
  soundingNow(): number {
    return this.t;
  }
}

interface Log {
  what: string;
  time: number;
  seconds?: number;
  gain: number;
  detail: string;
}

function recorder(): { out: BandOutput; log: Log[]; stops: number[] } {
  const log: Log[] = [];
  const stops: number[] = [];
  const out: BandOutput = {
    drum: (name, time, _v, gain) => log.push({ what: 'drum', time, gain, detail: name }),
    bass: (midi, time, seconds, _v, gain, tone) => log.push({ what: 'bass', time, seconds, gain, detail: `${midi}:${tone}` }),
    keys: (midis, time, seconds, _v, gain, voice) => log.push({ what: 'keys', time, seconds, gain, detail: `${midis.join('+')}:${voice}` }),
    guitar: (ev, time, seconds, gain) => log.push({ what: 'guitar', time, seconds, gain, detail: ev.midis.join('+') }),
    stopAll: () => stops.push(log.length),
  };
  return { out, log, stops };
}

describe('the band on the transport', () => {
  const setup = () => {
    const clock = new FakeClock();
    const rec = recorder();
    const band = new BackingBand({ clock, output: rec.out, timer: 'manual' });
    const run = (until: number): void => {
      while (clock.t < until - 1e-9) {
        clock.t = Math.min(until, clock.t + 0.02);
        band.transport.process();
        band.transport.flushVisual();
      }
    };
    return { clock, band, run, ...rec };
  };

  it('is minus-guitar by default, counts in, and plays every event at its time', () => {
    const { band, run, log } = setup();
    const a = band.load([C, G, Am, F], { style: 'pop-rock', tempo: 120, choruses: 1 });
    expect(band.isMuted('guitar')).toBe(true);
    expect(band.tempo).toBe(120);
    band.start();
    run(13);
    expect(log.some((l) => l.what === 'guitar')).toBe(false);
    // One bar of count-in on the side stick (4 clicks, 0.5 s apart), then the tune.
    const clicks = log.filter((l) => l.time < 0.08 + 2 - 1e-6);
    expect(clicks.map((c) => c.detail)).toEqual(['sidestick', 'sidestick', 'sidestick', 'sidestick']);
    clicks.forEach((c, i) => expect(c.time).toBeCloseTo(0.08 + i * 0.5, 9));
    const music = log.filter((l) => l.time >= 0.08 + 2 - 1e-6);
    const expected = a.events.filter((e) => e.type !== 'guitar');
    expect(music.length).toBe(expected.length);
    const t0 = 0.08 + 2;
    const want = expected.map((e) => +(t0 + e.tick / 1920).toFixed(6)).sort((x, y) => x - y);
    const got = music.map((m) => +m.time.toFixed(6)).sort((x, y) => x - y);
    expect(got).toEqual(want);
    // Durations are converted to seconds at the tempo: the final bass note lasts one bar = 2 s.
    const lastBass = music.filter((m) => m.what === 'bass').pop()!;
    expect(lastBass.seconds).toBeCloseTo(2, 9);
    expect(band.playing).toBe(false); // reached the end and stopped by itself
  });

  it('mutes, volumes and the guitar part can be switched while it plays', () => {
    const { band, run, log, clock } = setup();
    band.load([C, G], { style: 'folk', tempo: 100, loop: true, countInBars: 0 });
    band.setMuted('guitar', false);
    band.setMuted('drums', true);
    band.setVolume('bass', 0.5);
    band.start();
    run(3);
    expect(log.some((l) => l.what === 'guitar')).toBe(true);
    expect(log.some((l) => l.what === 'drum')).toBe(false);
    // The player's volume times the level the style mixes its bass at.
    expect(log.filter((l) => l.what === 'bass').every((l) => Math.abs(l.gain - 0.5 * (BACKING_STYLES.folk.bassLevel ?? 1)) < 1e-12)).toBe(true);
    band.setMuted('drums', false);
    const before = log.length;
    run(clock.t + 3);
    expect(log.slice(before).some((l) => l.what === 'drum')).toBe(true);
    expect(band.getVolume('bass')).toBe(0.5);
  });

  it('loops for ever without an ending and reports chord changes when they are heard', () => {
    const { band, run, clock } = setup();
    const a = band.load([C, G], { style: 'pop-rock', tempo: 240, loop: true, countInBars: 0, choruses: 1 });
    expect(a.hasEnding).toBe(false);
    const changes: Array<[string, string | undefined, number, number]> = [];
    band.onChord((c) => changes.push([c.segment.chord.symbol, c.next?.chord.symbol, c.time, clock.now()]));
    band.start();
    run(5.2);
    // A bar lasts 1 s at 240.
    expect(changes.slice(0, 5).map((c) => c[0])).toEqual(['C', 'G', 'C', 'G', 'C']);
    expect(changes.slice(0, 4).map((c) => c[1])).toEqual(['G', 'C', 'G', 'C']);
    changes.forEach((c, i) => {
      expect(c[2]).toBeCloseTo(0.08 + i, 9);
      expect(c[3]).toBeGreaterThanOrEqual(c[2] - 0.009);
    });
    expect(band.transport.loopCount).toBeGreaterThanOrEqual(2);
    expect(band.currentChord()?.chord.symbol).toBe('G'); // 5.2 s is in the sixth bar
    expect(band.playing).toBe(true);
  });

  it('follows tempo changes, pauses silently and resumes in place', () => {
    const { band, run, log, stops, clock } = setup();
    band.load([C, G, Am, F], { style: 'waltz', tempo: 120, loop: true, countInBars: 0 });
    band.start();
    run(2);
    band.setTempo(60);
    expect(band.tempo).toBe(60);
    run(11);
    const kicks = log.filter((l) => l.detail === 'kick' && l.time > 2.5).map((l) => l.time);
    expect(kicks[1] - kicks[0]).toBeCloseTo(3, 6); // a 3/4 bar at 60
    band.pause();
    expect(stops.length).toBeGreaterThan(0);
    const frozen = log.length;
    run(clock.t + 2);
    expect(log.length).toBe(frozen);
    band.resume();
    run(clock.t + 4);
    expect(log.length).toBeGreaterThan(frozen);
    band.stop();
    expect(band.playing).toBe(false);
    band.dispose();
  });

  it('uses the style tempo by default and compound-meter tempo in dotted beats', () => {
    const { band } = setup();
    band.load([C, F], { style: 'ballad-68' });
    expect(band.tempo).toBe(BACKING_STYLES['ballad-68'].tempo.default);
    expect(band.transport.bpm).toBeCloseTo(BACKING_STYLES['ballad-68'].tempo.default * 1.5, 9);
    expect(band.transport.meter.numerator).toBe(6);
    expect(band.style.id).toBe('ballad-68');
  });

  it('changes its arrangement live: no stop, no count-in, the new chords from the next bar line on', () => {
    const { band, run, log, stops, clock } = setup();
    band.load([C, G, Am, F], { style: 'pop-rock', tempo: 120, loop: true, countInBars: 1 });
    const changes: Array<[string, number]> = [];
    band.onChord((c) => changes.push([c.segment.chord.symbol, c.time]));
    const stopped: number[] = [];
    band.transport.on('stop', (e) => stopped.push(e.time));
    band.transport.onVisual('stop', (e) => stopped.push(e.time));
    band.start();
    // Count-in 0.08 .. 2.08 s, then a bar every 2 s: C at 2.08, G at 4.08 ...
    run(5);
    const stopsBefore = stops.length;
    const a = band.change([F, F, Am, G], { style: 'funk', tempo: 120, loop: true });
    expect(a.style).toBe('funk');
    expect(band.playing).toBe(true);
    run(12);
    expect(stopped).toEqual([]);
    expect(stops.length).toBe(stopsBefore); // nothing was silenced
    expect(band.style.id).toBe('funk');
    // Bar 1 (G) finishes; at 6.08 the new arrangement takes over at the same place in the form,
    // bar 2 (Am in both), then bar 3 is the new G, then round to the new F.
    const after = changes.filter(([, t]) => t > 5);
    expect(after.map(([s]) => s).slice(0, 3)).toEqual(['Am', 'G', 'F']);
    expect(after[0][1]).toBeCloseTo(6.08, 6);
    expect(after[1][1]).toBeCloseTo(8.08, 6);
    // The music never stopped: drum hits keep coming every bar with no gap at the change.
    const kicks = log.filter((l) => l.what === 'drum' && l.detail === 'kick' && l.time > 2).map((l) => l.time);
    for (let i = 1; i < kicks.length; i++) expect(kicks[i] - kicks[i - 1]).toBeLessThan(2.01);
    expect(clock.t).toBeGreaterThan(11);
  });

  it('a change during the count-in is made at once; a change while stopped is a load', () => {
    const { band, run } = setup();
    band.load([C, G], { style: 'pop-rock', tempo: 120, loop: true, countInBars: 1 });
    const changes: string[] = [];
    band.onChord((c) => changes.push(c.segment.chord.symbol));
    band.start();
    run(0.5);
    band.change([Am, F], { style: 'pop-rock', tempo: 120, loop: true, countInBars: 1 });
    run(5);
    expect(changes.slice(0, 2)).toEqual(['Am', 'F']);
    band.stop();
    const b = band.change([G], { style: 'waltz' });
    expect(band.playing).toBe(false);
    expect(b.style).toBe('waltz');
    expect(band.transport.meter.numerator).toBe(3);
  });

  it('a reload and restart (the old way to change a playing band) no longer reports a late stop', () => {
    const { band, run, clock } = setup();
    const heard: string[] = [];
    band.transport.onVisual('stop', () => heard.push('stop'));
    band.transport.onVisual('start', () => heard.push('start'));
    band.load([C, G], { style: 'pop-rock', loop: true });
    band.start();
    run(3);
    heard.length = 0;
    band.load([Am, F], { style: 'pop-rock', loop: true });
    band.start({ countIn: 0 });
    run(clock.t + 2);
    expect(heard).toEqual(['start']);
  });
});
