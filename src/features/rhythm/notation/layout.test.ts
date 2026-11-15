import { describe, expect, it } from 'vitest';
import { READ_LEVELS, generatePhrase } from '../core/generate';
import { parseRhythm, rhythmOnsets } from '../core/rhythm';
import { ABOVE, BELOW_COUNTS, BELOW_MARKS, layoutRhythm, naturalWidth, unswing, xAtTick } from './layout';
import { describeRhythm } from './RhythmStaff';

const lay = (text: string, width = 700, opts: Parameters<typeof layoutRhythm>[1] extends infer O ? Partial<O> : never = {}, meter = '4/4') =>
  layoutRhythm(parseRhythm(text, meter), { width, counts: true, marks: true, ...opts });

describe('spacing', () => {
  it('gives longer notes more room, but less than proportionally', () => {
    expect(naturalWidth(480)).toBeGreaterThan(naturalWidth(240));
    expect(naturalWidth(3840)).toBeLessThan(naturalWidth(240) * 4);
    const l = lay('q q e e q | w');
    const xs = l.systems[0].items.map((p) => p.cx);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // The eighth pair sits closer together than the quarters before it.
    expect(xs[3] - xs[2]).toBeLessThan(xs[1] - xs[0]);
  });

  it('keeps everything inside the width it was given', () => {
    for (const width of [326, 436, 560, 900]) {
      for (const level of READ_LEVELS) {
        for (let seed = 0; seed < 6; seed++) {
          const l = layoutRhythm(generatePhrase(level, seed), { width, counts: true, marks: true });
          for (const system of l.systems) {
            expect(system.x1, `level ${level.id} seed ${seed} width ${width}`).toBeLessThanOrEqual(width + 0.5);
            for (const p of system.items) expect(p.x).toBeGreaterThanOrEqual(0);
            for (const b of system.beams) expect(b.x2).toBeLessThanOrEqual(system.x1);
          }
          expect(l.scale).toBeGreaterThanOrEqual(6);
          expect(l.scale).toBeLessThanOrEqual(13);
        }
      }
    }
  });

  it('breaks a dense phrase over two lines on a phone and keeps it on one line on a wide screen', () => {
    const dense = 's s s s s s s s e s s e s s | s s s s q s s s s q';
    expect(lay(dense, 326).systems).toHaveLength(2);
    expect(lay(dense, 960).systems).toHaveLength(1);
    expect(lay('q q q q | h h', 326).systems.length).toBeLessThanOrEqual(2);
    // The time signature opens the first line only.
    const two = lay(dense, 326);
    expect(two.systems[0].timeSignature).toMatchObject({ numerator: 4, denominator: 4 });
    expect(two.systems[1].timeSignature).toBeNull();
  });

  it('fits a limited height: one line where two would be too tall, and a smaller size', () => {
    const text = 'q e e q q | e e e e h';
    const free = lay(text, 436);
    const lineSpaces = ABOVE + BELOW_COUNTS + BELOW_MARKS;
    const tight = lay(text, 436, { maxHeight: 170 });
    expect(tight.height).toBeLessThanOrEqual(170 + 0.5);
    expect(tight.systems).toHaveLength(1);
    expect(tight.scale).toBeLessThanOrEqual(free.scale);
    expect(tight.height).toBeCloseTo(tight.scale * lineSpaces, 3);
  });
});

describe('what is drawn', () => {
  it('numbers the onsets exactly as the rhythm does', () => {
    const r = parseRhythm('q rq q~ q~ | q e e h');
    const l = layoutRhythm(r, { width: 700 });
    const onsets = l.systems.flatMap((s) => s.items).filter((p) => p.onset !== null);
    expect(onsets.map((p) => p.onset)).toEqual(rhythmOnsets(r).map((_, i) => i));
    expect(onsets.map((p) => p.bar * 3840 + p.item.tick)).toEqual(rhythmOnsets(r).map((o) => o.tick));
  });

  it('beams by beat, flags the loners and draws stems on everything but whole notes', () => {
    const l = lay('e e e q e q | s s s s rq h', 900);
    const [system] = l.systems;
    const first = system.items.filter((p) => p.bar === 0);
    // e e | e q e q: one beam for the first pair, flags on the two lone eighths.
    expect(first.map((p) => p.flags)).toEqual([0, 0, 1, 0, 1, 0]);
    const primary = system.beams.filter((b) => b.level === 1);
    expect(primary).toHaveLength(2);
    expect(primary[0].x1).toBeCloseTo(first[0].stemX!, 5);
    expect(primary[0].x2).toBeCloseTo(first[1].stemX!, 5);
    expect(system.beams.filter((b) => b.level === 2)).toHaveLength(3);
    expect(lay('w | h h').systems[0].items.map((p) => p.stemX === null)).toEqual([true, false, false]);
  });

  it('draws ties from note to note, across the bar line and across a line break', () => {
    const one = lay('q q q q~ | q q h', 900);
    expect(one.systems[0].ties).toHaveLength(1);
    const tie = one.systems[0].ties[0];
    const items = one.systems[0].items;
    expect(tie.x1).toBeGreaterThan(items[3].x);
    expect(tie.x2).toBeLessThan(items[4].cx);
    const broken = lay('s s s s s s s s s s s s e e~ | e s s s s s s s s s s s s s s', 326);
    expect(broken.systems).toHaveLength(2);
    expect(broken.systems[0].ties).toHaveLength(1);
    expect(broken.systems[1].ties).toHaveLength(1);
  });

  it('marks triplets, with a bracket only when they are not beamed', () => {
    const l = lay('3e 3e 3e q 3q 3e q');
    expect(l.systems[0].tuplets).toHaveLength(2);
    expect(l.systems[0].tuplets.map((t) => t.bracket)).toEqual([false, true]);
  });

  it('writes the count under every note and the beats that pass under a held one', () => {
    const l = lay('h q. e | w');
    const [system] = l.systems;
    expect(system.items.map((p) => p.count.text)).toEqual(['1', '3', '&', '1']);
    expect(system.held.map((h) => h.text)).toEqual(['2', '4', '2', '3', '4']);
    const xs = system.held.map((h) => h.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('centres a whole-bar rest', () => {
    const l = lay('q q q q | rw', 800);
    const rest = l.systems[0].items[4];
    const [barOne, barTwo] = l.systems[0].barlines;
    expect(Math.abs(rest.cx - (barOne.x + barTwo.x) / 2)).toBeLessThan(1);
    expect(barTwo.final).toBe(true);
  });

  it('leaves room between the counting syllables, triplets and sixteenths included', () => {
    // Counts are set in the mono font (0.6 em per character) at the size RhythmStaff uses.
    for (const width of [326, 436, 700]) {
      for (const level of READ_LEVELS) {
        for (let seed = 0; seed < 8; seed++) {
          const l = layoutRhythm(generatePhrase(level, seed), { width, counts: true, marks: true });
          const size = Math.max(11, l.scale * 1.42);
          for (const system of l.systems) {
            const labels = [
              ...system.items.filter((p) => p.count.text && (p.item.rest || p.onset !== null)).map((p) => ({ x: p.cx, text: p.count.text })),
              ...system.held.map((h) => ({ x: h.x, text: h.text })),
            ].sort((a, b) => a.x - b.x);
            for (let i = 1; i < labels.length; i++) {
              const need = ((labels[i - 1].text.length + labels[i].text.length) * 0.6 * size) / 2 + 1;
              expect(labels[i].x - labels[i - 1].x, `level ${level.id} seed ${seed} width ${width}: "${labels[i - 1].text}" / "${labels[i].text}"`).toBeGreaterThanOrEqual(need);
            }
          }
        }
      }
    }
  });

  it('describes itself for screen readers', () => {
    expect(describeRhythm(parseRhythm('q. e rq 3e 3e 3e | h~ h'))).toBe('Rhythm in 4/4: dotted quarter, eighth, quarter rest, triplet eighth, triplet eighth, triplet eighth; half tied, half.');
    expect(describeRhythm(parseRhythm('e e e q.', '6/8', { swing: false }))).toContain('6/8');
  });
});

describe('the playhead', () => {
  it('maps ticks to x, monotonically, over line breaks', () => {
    const l = lay('s s s s s s s s e s s e s s | s s s s q s s s s q', 326);
    let last = { system: 0, x: -1 };
    for (let tick = 0; tick <= 7680; tick += 120) {
      const at = xAtTick(l, tick);
      if (at.system === last.system) expect(at.x).toBeGreaterThanOrEqual(last.x - 1e-6);
      else expect(at.system).toBe(last.system + 1);
      last = at;
    }
    expect(xAtTick(l, 0).system).toBe(0);
    expect(xAtTick(l, 7000).system).toBe(1);
    // On the note when it sounds.
    const second = l.systems[0].items[4];
    expect(xAtTick(l, second.item.tick).x).toBeCloseTo(second.cx, 5);
  });

  it('undoes swing so the playhead reaches the written off-beat when it is heard', () => {
    expect(unswing(0)).toBe(0);
    expect(unswing(640)).toBe(480);
    expect(unswing(960)).toBe(960);
    expect(unswing(960 + 640)).toBe(960 + 480);
    expect(unswing(320)).toBe(240);
  });
});
