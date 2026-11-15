/**
 * Structural and engine cross-checks for the whole catalog: ids, references, feels against the
 * audio module, every numeral against the theory engine, every progression in all 12 keys.
 */
import { describe, expect, it } from 'vitest';
import { BACKING_STYLES, BACKING_STYLE_IDS, arrangeBacking, layoutProgression } from '@/core/audio';
import { chord, chordNotes, getScale, isNote, isDegree, note, parseChord, parseRoman } from '@/core/theory';
import {
  PROGRESSIONS, PROGRESSION_FAMILIES, PROGRESSION_STYLES, backingFor, bestTonic, formatProgressionName, formatSlot,
  getProgression, keyChoices, parseSlot, progression, progressionInKey, progressionSkillId, progressionsByFamily,
  progressionsByLevel, progressionsByStyle, relatedProgressions, resolveProgression, searchProgressions, soloScales,
  tonicSpellings, type Progression, type ProgressionFeel,
} from './index';

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const feelsOf = (p: Progression): ProgressionFeel[] => [p.feel, ...(p.altFeels ?? [])];
const meterText = (id: keyof typeof BACKING_STYLES) => {
  const ts = BACKING_STYLES[id].timeSignature;
  return `${ts.numerator}/${ts.denominator}`;
};
/** Every user-facing string of an entry, for text checks. */
function texts(p: Progression): string[] {
  return [
    p.name, p.why, p.tryThis.strum, p.tryThis.tip ?? '', ...(p.aka ?? []),
    ...Object.values(p.keyNotes ?? {}), ...(p.heardIn ?? []).flatMap((h) => [h.title, h.by, h.note ?? '']),
  ];
}

describe('catalog shape', () => {
  it('holds 130 to 180 progressions', () => {
    expect(PROGRESSIONS.length).toBeGreaterThanOrEqual(130);
    expect(PROGRESSIONS.length).toBeLessThanOrEqual(180);
  });

  it('has unique, slug-safe ids', () => {
    const seen = new Set<string>();
    for (const p of PROGRESSIONS) {
      expect(p.id, p.id).toMatch(ID_RE);
      expect(seen.has(p.id), `duplicate id ${p.id}`).toBe(false);
      seen.add(p.id);
    }
  });

  it('has unique names', () => {
    const names = PROGRESSIONS.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses every listed family and style, and only those', () => {
    const families = new Set(PROGRESSION_FAMILIES.map((f) => f.id));
    const styles = new Set(PROGRESSION_STYLES.map((s) => s.id));
    for (const p of PROGRESSIONS) {
      expect(families.has(p.family), p.id).toBe(true);
      expect(p.styles.length, p.id).toBeGreaterThan(0);
      expect(new Set(p.styles).size, `${p.id}: repeated style`).toBe(p.styles.length);
      for (const s of p.styles) expect(styles.has(s), `${p.id}: style ${s}`).toBe(true);
    }
    for (const s of styles) expect(progressionsByStyle(s).length, `style ${s} is empty`).toBeGreaterThan(0);
    for (const f of families) expect(PROGRESSIONS.some((p) => p.family === f), `family ${f} is empty`).toBe(true);
  });

  it('spreads over the levels, each an integer from 1 to 10', () => {
    for (const p of PROGRESSIONS) {
      expect(Number.isInteger(p.level), p.id).toBe(true);
      expect(p.level, p.id).toBeGreaterThanOrEqual(1);
      expect(p.level, p.id).toBeLessThanOrEqual(10);
    }
    const levels = new Set(PROGRESSIONS.map((p) => p.level));
    for (let l = 1; l <= 10; l++) expect(levels.has(l), `no progression at level ${l}`).toBe(true);
  });

  it('explains every progression in exactly two sentences', () => {
    for (const p of PROGRESSIONS) {
      const ends = p.why.match(/[.!?](?=\s|$)/g) ?? [];
      expect(ends.length, `${p.id}: ${p.why}`).toBe(2);
      expect(p.why.trim().endsWith('.'), p.id).toBe(true);
    }
  });

  it('gives practical advice: one or two scales and a strumming feel', () => {
    for (const p of PROGRESSIONS) {
      expect(p.tryThis.scales.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.tryThis.scales.length, p.id).toBeLessThanOrEqual(2);
      expect(p.tryThis.strum.length, p.id).toBeGreaterThan(20);
      for (const s of p.tryThis.scales) {
        expect(getScale(s.scale), `${p.id}: scale ${s.scale}`).not.toBeNull();
        expect(isDegree(s.degree) && /^[b#]?[1-7]$/.test(s.degree), `${p.id}: degree ${s.degree}`).toBe(true);
      }
    }
  });

  it('writes notes and numerals in ASCII and keeps the text tidy', () => {
    for (const p of PROGRESSIONS) {
      for (const t of texts(p)) {
        expect(/[♭♯𝄪𝄫]/.test(t), `${p.id}: "${t}"`).toBe(false);
        expect(t, p.id).toBe(t.trim());
        expect(/ {2}/.test(t), `${p.id}: double space in "${t}"`).toBe(false);
        expect(/!/.test(t), `${p.id}: no exclamation marks`).toBe(false);
      }
    }
  });

  it('links only to progressions that exist', () => {
    for (const p of PROGRESSIONS) {
      expect(p.related.length, `${p.id} has no relatives`).toBeGreaterThan(0);
      expect(new Set(p.related).size, `${p.id}: repeated relative`).toBe(p.related.length);
      for (const r of p.related) {
        expect(r, p.id).not.toBe(p.id);
        expect(getProgression(r), `${p.id} -> ${r}`).not.toBeNull();
      }
    }
  });

  it('names real, best-spelled guitar keys', () => {
    for (const p of PROGRESSIONS) {
      expect(p.keys.length, p.id).toBeGreaterThan(0);
      expect(new Set(p.keys.map((k) => note(k).chroma)).size, `${p.id}: repeated key`).toBe(p.keys.length);
      for (const k of p.keys) {
        expect(isNote(k) && note(k).octave === null, `${p.id}: key ${k}`).toBe(true);
        expect(bestTonic(p, k), `${p.id}: ${k} is not the clearest spelling`).toBe(k);
      }
      for (const k of Object.keys(p.keyNotes ?? {})) expect(p.keys.includes(k), `${p.id}: keyNotes ${k}`).toBe(true);
    }
  });

  it('keeps heardIn entries complete and few', () => {
    for (const p of PROGRESSIONS) {
      if (!p.heardIn) continue;
      expect(p.heardIn.length, p.id).toBeGreaterThan(0);
      expect(p.heardIn.length, p.id).toBeLessThanOrEqual(4);
      for (const h of p.heardIn) {
        expect(h.title.length, p.id).toBeGreaterThan(0);
        expect(h.by.length, p.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('charts', () => {
  it('parse into complete bars that fit every feel', () => {
    for (const p of PROGRESSIONS) {
      expect(p.bars.length, p.id).toBeGreaterThan(0);
      expect(p.bars.length, p.id).toBeLessThanOrEqual(32);
      for (const f of feelsOf(p)) {
        const beats = BACKING_STYLES[f.backing].beatsPerBar;
        for (const bar of p.bars) {
          expect(bar.length, `${p.id}: empty bar`).toBeGreaterThan(0);
          expect(bar.length, `${p.id}: ${bar.join(' ')} in ${f.backing}`).toBeLessThanOrEqual(Math.min(2, beats));
        }
      }
      // The chart text and the parsed bars agree token for token.
      expect(p.bars.map((b) => b.join(' ')).join(' | '), p.id).toBe(p.chart.split('|').map((s) => s.trim().split(/\s+/).join(' ')).join(' | '));
    }
  });

  it('use only numerals the theory engine parses', () => {
    for (const p of PROGRESSIONS) {
      for (const token of p.bars.flat()) {
        const slot = parseSlot(token);
        expect(slot, `${p.id}: ${token}`).not.toBeNull();
        expect(parseRoman(slot!.numeral), `${p.id}: ${token}`).not.toBeNull();
        if (slot!.bass) expect(isDegree(slot!.bass), `${p.id}: bass ${slot!.bass}`).toBe(true);
      }
    }
  });

  it('match their section labels', () => {
    for (const p of PROGRESSIONS) {
      if (!p.sections) continue;
      expect(p.sections.reduce((n, s) => n + s.bars, 0), p.id).toBe(p.bars.length);
    }
  });
});

describe('feels', () => {
  it('name backing styles that exist, in their own meter and tempo range', () => {
    for (const p of PROGRESSIONS) {
      for (const f of feelsOf(p)) {
        expect(BACKING_STYLE_IDS.includes(f.backing), `${p.id}: ${f.backing}`).toBe(true);
        const style = BACKING_STYLES[f.backing];
        expect(f.meter, `${p.id}: meter of ${f.backing}`).toBe(meterText(f.backing));
        const [slow, fast] = f.tempo;
        expect(slow, `${p.id}: tempo range of ${f.backing}`).toBeLessThan(fast);
        expect(slow, `${p.id}: ${f.backing} slowest ${style.tempo.min}`).toBeGreaterThanOrEqual(style.tempo.min);
        expect(fast, `${p.id}: ${f.backing} fastest ${style.tempo.max}`).toBeLessThanOrEqual(style.tempo.max);
        expect(fast - slow, `${p.id}: a range of at least 10 bpm`).toBeGreaterThanOrEqual(10);
      }
      const alts = (p.altFeels ?? []).map((f) => f.backing);
      expect(new Set([p.feel.backing, ...alts]).size, `${p.id}: repeated feel`).toBe(alts.length + 1);
    }
  });
});

describe('resolution in every key', () => {
  it('resolves every progression on all 12 tonics, in every spelling, to chords the engine accepts', () => {
    for (const p of PROGRESSIONS) {
      for (let pc = 0; pc < 12; pc++) {
        for (const tonic of tonicSpellings(pc)) {
          const r = resolveProgression(p, tonic);
          expect(r.bars.length, `${p.id} in ${tonic}`).toBe(p.bars.length);
          for (const c of r.bars.flat()) {
            const parsed = parseChord(c.symbol);
            expect(parsed, `${p.id} in ${tonic}: ${c.token} -> ${c.symbol}`).not.toBeNull();
            expect(chordNotes(c.symbol), `${p.id} in ${tonic}: ${c.symbol}`).toEqual(c.notes);
            expect(c.backing.root).toBe(note(c.root).chroma);
            expect(new Set(c.backing.tones)).toEqual(new Set(c.notes.map((n) => note(n).chroma)));
            if (c.bass) {
              expect(parsed!.bass, `${p.id} in ${tonic}: ${c.symbol}`).not.toBeNull();
              expect(c.backing.bass).toBe(note(c.bass).chroma);
              expect(note(c.bass).chroma, `${p.id}: ${c.token} has its root as bass`).not.toBe(note(c.root).chroma);
            } else {
              expect(c.backing.bass).toBeUndefined();
            }
            for (const n of [...c.notes, ...(c.bass ? [c.bass] : [])]) {
              expect(Math.abs(note(n).alt), `${p.id} in ${tonic}: ${c.symbol} spells ${n}`).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    }
  });

  it('keeps the same sound in every key (pitch classes relative to the tonic never change)', () => {
    for (const p of PROGRESSIONS) {
      const shape = (tonic: string) => {
        const t = note(tonic).chroma;
        return resolveProgression(p, tonic).bars.flat().map((c) => ({
          root: (c.backing.root - t + 12) % 12,
          tones: [...c.backing.tones].map((x) => (x - t + 12) % 12).sort((a, b) => a - b),
          bass: c.backing.bass === undefined ? null : (c.backing.bass - t + 12) % 12,
        }));
      };
      const reference = shape(p.keys[0]);
      for (const tonic of keyChoices(p)) expect(shape(tonic), `${p.id} in ${tonic}`).toEqual(reference);
    }
  });

  it('offers twelve distinct, sensibly spelled keys', () => {
    for (const p of PROGRESSIONS) {
      const choices = keyChoices(p);
      expect(new Set(choices.map((k) => note(k).chroma)).size, p.id).toBe(12);
      for (const k of choices) {
        const chords = resolveProgression(p, k).bars.flat();
        for (const c of chords) {
          for (const n of c.notes) expect(Math.abs(note(n).alt), `${p.id} in ${k}: ${c.symbol}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('builds BackingBand bars that the arranger lays out beat for beat', () => {
    for (const p of PROGRESSIONS) {
      for (const f of feelsOf(p)) {
        const setup = backingFor(p, undefined, { feel: f });
        expect(setup.options.style).toBe(f.backing);
        expect(setup.options.tempo).toBeGreaterThanOrEqual(f.tempo[0]);
        expect(setup.options.tempo).toBeLessThanOrEqual(f.tempo[1]);
        const style = BACKING_STYLES[f.backing];
        const segments = layoutProgression(setup.bars, style);
        // Every chord change in the chart is a segment start (repeated chords may merge within a bar).
        const starts = new Set(segments.map((s) => `${s.bar}:${s.beat}`));
        setup.resolved.bars.forEach((bar, i) => bar.forEach((c) => expect(starts.has(`${i}:${c.beat}`) || bar.some((o) => o !== c && o.symbol === c.symbol), `${p.id} bar ${i + 1} beat ${c.beat}`).toBe(true)));
        const total = setup.resolved.bars.flat().reduce((n, c) => n + c.beats, 0);
        expect(total, p.id).toBe(p.bars.length * style.beatsPerBar);
      }
    }
  });

  it('arranges a full backing track for a sample of feels without error', () => {
    const sample = ['pop-axis', 'blues-jazz', 'jazz-rhythm-changes', 'classical-folia', 'flamenco-cadence-phrygian', 'fifties-triplet', 'latin-blue-bossa', 'metal-locrian'];
    for (const id of sample) {
      const setup = backingFor(id);
      const arrangement = arrangeBacking(setup.bars, { style: setup.options.style, choruses: 1 });
      expect(arrangement.events.length, id).toBeGreaterThan(0);
      expect(arrangement.chorusBars, id).toBe(getProgression(id)!.bars.length);
    }
  });

  it('resolves the soloing scales in a key', () => {
    for (const p of PROGRESSIONS) {
      for (const k of p.keys) {
        for (const s of soloScales(p, k)) {
          expect(isNote(s.tonic), `${p.id} in ${k}`).toBe(true);
          expect(Math.abs(note(s.tonic).alt), `${p.id} in ${k}: ${s.tonic}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('agrees with direct engine results for a hand-picked sample', () => {
    const symbols = (id: string, tonic: string) => resolveProgression(getProgression(id)!, tonic).bars.map((b) => b.map((c) => c.symbol).join(' '));
    expect(symbols('pop-axis', 'C')).toEqual(['C', 'G', 'Am', 'F']);
    expect(symbols('pop-axis-walkdown', 'C')).toEqual(['C', 'G/B', 'Am', 'F']);
    expect(symbols('flamenco-andalusian', 'A')).toEqual(['Am', 'G', 'F', 'E']);
    expect(symbols('flamenco-cadence-phrygian', 'E')).toEqual(['Am', 'G', 'F', 'E']);
    expect(symbols('blues-jazz', 'F')).toEqual(['F7', 'Bb7', 'F7', 'Cm7 F7', 'Bb7', 'Bdim7', 'F7', 'D7', 'Gm7', 'C7', 'F7 D7', 'Gm7 C7']);
    expect(symbols('blues-bird', 'F')).toEqual(['Fmaj7', 'Em7b5 A7', 'Dm7 G7', 'Cm7 F7', 'Bb7', 'Bbm7 Eb7', 'Am7 D7', 'Abm7 Db7', 'Gm7', 'C7', 'Fmaj7 D7', 'Gm7 C7']);
    expect(symbols('jazz-rhythm-a', 'Bb')).toEqual(['Bb6 G7', 'Cm7 F7', 'Bb6 G7', 'Cm7 F7', 'Fm7 Bb7', 'Eb7 Edim7', 'Bb/F G7', 'Cm7 F7']);
    expect(symbols('jazz-coltrane-cycle', 'C')).toEqual(['Cmaj7 Eb7', 'Abmaj7 B7', 'Emaj7 G7', 'Cmaj7']);
    expect(symbols('jazz-tritone-turnaround', 'C')).toEqual(['Cmaj7 Eb7', 'Dm7 Db7']);
    expect(symbols('classical-canon-bass', 'D')).toEqual(['D', 'A/C#', 'Bm', 'F#m/A', 'G', 'D/F#', 'G', 'A']);
    expect(symbols('classical-lament-chromatic', 'A')).toEqual(['Am', 'E/G#', 'C/G', 'D/F#', 'Dm/F', 'E']);
    expect(symbols('classical-neapolitan', 'A')).toEqual(['Am', 'Bb/D', 'E7', 'Am']);
    expect(symbols('classical-bach-prelude', 'C')).toEqual(['C', 'Dm7/C', 'G7/B', 'C']);
    expect(symbols('gospel-walk-up', 'C')).toEqual(['C C7/E', 'F F#dim7', 'C/G A7', 'Dm7 G7']);
    expect(symbols('latin-blue-bossa', 'C').slice(8, 12)).toEqual(['Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7']);
    expect(symbols('latin-ipanema', 'F')).toEqual(['Fmaj7', 'Fmaj7', 'G7', 'G7', 'Gm7', 'Gb7', 'Fmaj7', 'Gb7']);
    expect(symbols('rnb-just-the-two', 'F')).toEqual(['Dbmaj7', 'C7', 'Fm7', 'Ebm7 Ab7']);
    expect(symbols('borrowed-creep', 'G')).toEqual(['G', 'B', 'C', 'Cm']);
    expect(symbols('folk-rising-sun', 'A').slice(0, 8)).toEqual(['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E']);
    expect(symbols('jazz-so-what', 'D')[16]).toBe('Ebm7');
    expect(symbols('metal-locrian', 'E')).toEqual(['E5 F5', 'E5 Bb5']);
    expect(symbols('line-minor-down', 'A')).toEqual(['Am', 'AmMaj7', 'Am7', 'Am6']);
    expect(symbols('line-minor-up', 'E')).toEqual(['Em', 'C/E', 'Em6', 'Em7']);
    expect(chord(symbols('lydian-pedal', 'D')[1]).bass).toBe('D');
  });

  it('matches the examples in API.md', () => {
    const p = getProgression('flamenco-andalusian')!;
    expect(progressionInKey(p, 'E').bars.map((b) => b.map((c) => c.symbol))).toEqual([['Em'], ['D'], ['C'], ['B']]);
    expect(p.bars.flat().map((t) => formatSlot(t))).toEqual(['i', '♭VII', '♭VI', 'V']);
    expect(keyChoices(p)).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);
    expect(formatSlot('iv/b6')).toBe('iv/♭6');
    expect(formatProgressionName('I–bVII–IV (double plagal)')).toBe('I–♭VII–IV (double plagal)');
    expect(formatProgressionName('Tritone-sub turnaround (I–bIII7–ii–bII7)')).toBe('Tritone-sub turnaround (I–♭III7–ii–♭II7)');
    expect(formatProgressionName('Gospel walk-up (I–I7/3–IV–#iv°7)')).toBe('Gospel walk-up (I–I7/3–IV–♯iv°7)');
    expect(formatProgressionName('bittersweet blues')).toBe('bittersweet blues');
    const setup = backingFor('blues-quick-change', 'A', { loop: true });
    expect(setup.options).toEqual({ loop: true, style: 'blues-shuffle', tempo: 106 });
    expect(setup.bars.length).toBe(12);
    expect(progressionSkillId('pop-axis')).toBe('progression:pop-axis');
  });

  it('spells keys the way a musician would', () => {
    const p = (id: string) => getProgression(id)!;
    expect(keyChoices(p('pop-axis'))).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(bestTonic(p('flamenco-andalusian'), 1)).toBe('C#');
    expect(bestTonic(p('flamenco-andalusian'), 8)).toBe('G#');
    expect(bestTonic(p('flamenco-andalusian'), 3)).toBe('Eb');
    expect(bestTonic(p('blues-12-bar'), 'A#')).toBe('Bb');
    expect(bestTonic(p('dorian-i-iv'), 1)).toBe('C#');
    expect(bestTonic(p('borrowed-mario'), 6)).toBe('F#');
  });
});

describe('lookups', () => {
  it('finds by id, style, level, family and text', () => {
    expect(getProgression('nope')).toBeNull();
    expect(() => progression('nope')).toThrow(RangeError);
    expect(progression('pop-axis').family).toBe('pop-rock');
    const blues = progressionsByStyle('blues');
    expect(blues.map((x) => x.id)).toContain('blues-12-bar');
    for (let i = 1; i < blues.length; i++) expect(blues[i].level).toBeGreaterThanOrEqual(blues[i - 1].level);
    expect(progressionsByLevel(1).every((x) => x.level === 1)).toBe(true);
    expect(progressionsByLevel(9, 10).map((x) => x.id)).toEqual(expect.arrayContaining(['jazz-coltrane-cycle', 'classical-augmented-sixth']));
    expect(progressionsByFamily('flamenco').map((x) => x.id)[0]).toBe('flamenco-andalusian');
    expect(searchProgressions('Andalusian').map((x) => x.id)).toContain('flamenco-andalusian');
    expect(searchProgressions('ice cream').map((x) => x.id)).toEqual(['fifties-i-vi-iv-v']);
    expect(searchProgressions('ipanema').map((x) => x.id)).toEqual(['latin-ipanema']);
    expect(searchProgressions('   ')).toEqual([]);
    expect(relatedProgressions('pop-axis').length).toBe(getProgression('pop-axis')!.related.length);
    const counts = PROGRESSION_FAMILIES.map((f) => progressionsByFamily(f.id).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(PROGRESSIONS.length);
  });

  it('freezes the catalog', () => {
    expect(Object.isFrozen(PROGRESSIONS)).toBe(true);
    expect(Object.isFrozen(PROGRESSIONS[0])).toBe(true);
    expect(Object.isFrozen(PROGRESSIONS[0].bars)).toBe(true);
  });
});
