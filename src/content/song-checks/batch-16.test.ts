/**
 * Independent cross-checks for batch 16 of the built-in songs (level 8-10 original studies):
 * st-chord-melody-2, st-read-shifting, st-two-voice-invention, st-concert-tremolo-etude,
 * st-fugue-exposition.
 *
 * The expected music below is written out by hand as note names and rhythms from the
 * composition plans, voice by voice, not copied from the tab. Each song is parsed with the song
 * core and compared tick by tick: what is struck at every onset, and what is still sounding
 * (struck or tied) at every beat, so a wrong fret, a wrong rhythm or a missing tie all fail.
 * The checks then cover the chord grips, notes on strong beats against the chord in force,
 * parallel fifths and octaves between the voices, the imitations (subject, answer, countersubject),
 * keys, meters, positions and range, and the difficulty estimate against the plan's level
 * (with the reason where they differ).
 */
import { describe, expect, it } from 'vitest';
import { estimateDifficulty, parseSixTab, type Song } from '@/core/song';
import { buildVoicing, checkVoicingFingering, simultaneousCost } from '@/core/guitar';
import { chordPcs, midiToNote, noteToMidi, parseChord, scalePcs } from '@/core/theory';
import { loadSongText, songEntry } from '@/content/songs';

const STANDARD = [40, 45, 50, 55, 59, 64];
const DROP_D = [38, 45, 50, 55, 59, 64];
const IDS = ['st-chord-melody-2', 'st-read-shifting', 'st-two-voice-invention', 'st-concert-tremolo-etude', 'st-fugue-exposition'];
const PLAN_LEVEL: Record<string, number> = {
  'st-chord-melody-2': 8,
  'st-read-shifting': 9,
  'st-two-voice-invention': 9,
  'st-concert-tremolo-etude': 10,
  'st-fugue-exposition': 10,
};

const pc = (m: number) => ((m % 12) + 12) % 12;
const name = (m: number) => midiToNote(m, { prefer: 'sharps' });
const sameNotes = (ms: number[]) => [...ms].sort((a, b) => a - b).map(name).join('+');

async function load(id: string): Promise<Song> {
  const result = parseSixTab(await loadSongText(id));
  expect(result.errors, `${id}: parse errors`).toEqual([]);
  return result.song!;
}

// ---------------------------------------------------------------- a tiny reader for the expected music
/** Ticks of a duration word: w h q e s /32, dots, and a tuplet digit (e3 = an eighth triplet). */
function ticksOf(tok: string): number | null {
  const m = /^(w|h|q|e|s|\/32)(\.*)(\d*)$/.exec(tok);
  if (!m) return null;
  const base = { w: 3840, h: 1920, q: 960, e: 480, s: 240, '/32': 120 }[m[1] as 'w']!;
  let t = base;
  let add = base;
  for (let i = 0; i < m[2].length; i++) {
    add /= 2;
    t += add;
  }
  if (m[3]) {
    const n = Number(m[3]);
    let normal = 1;
    while (normal * 2 < n) normal *= 2;
    t = (t * normal) / n;
  }
  return t;
}

interface Ev {
  start: number;
  dur: number;
  /** Sounding pitches; empty for a rest. */
  midis: number[];
}

/** "q E4 e. D#4 s E4 h (E2 B2) r" -> events from tick 0 of the bar. */
function line(text: string): Ev[] {
  const toks = text.match(/\([^)]*\)|\S+/g) ?? [];
  const out: Ev[] = [];
  let t = 0;
  let cur: number | null = null;
  for (const tok of toks) {
    const d = ticksOf(tok);
    if (d !== null) {
      cur = d;
      continue;
    }
    if (cur === null) throw new Error(`no duration before ${tok} in "${text}"`);
    const midis = tok === 'r' ? [] : tok.startsWith('(') ? tok.slice(1, -1).trim().split(/\s+/).map((n) => noteToMidi(n)) : [noteToMidi(tok)];
    out.push({ start: t, dur: cur, midis });
    t += cur;
  }
  return out;
}

/** Bars of several voices: { T: [bar1, bar2, ...], B: [...] } -> per bar, per voice, events. */
type Voices = Record<string, string[]>;

/** What the song plays in one bar of its first track: every beat with its struck and its held pitches. */
function actualBar(song: Song, bar: number, track = 0) {
  return song.tracks[track].measures[bar].beats.map((b) => ({
    start: b.start,
    dur: b.duration,
    struck: b.notes.filter((n) => !n.tie).map((n) => n.midi),
    sounding: b.notes.map((n) => n.midi),
    strings: b.notes.filter((n) => !n.tie).map((n) => n.string),
    frets: b.notes.filter((n) => !n.tie).map((n) => n.fret),
    pluck: b.notes.filter((n) => !n.tie).map((n) => n.pluck),
  }));
}

/** Compare a bar of the song with the expected voices: onsets, struck notes and sounding notes. */
function compareBar(song: Song, bar: number, voices: Record<string, string>, barTicks: number): string[] {
  const evs = Object.entries(voices).map(([v, text]) => {
    const e = line(text);
    const total = e.reduce((s, x) => s + x.dur, 0);
    if (total !== barTicks) throw new Error(`expected voice ${v} of bar ${bar + 1} holds ${total} ticks, not ${barTicks}`);
    return e;
  });
  const problems: string[] = [];
  const beats = actualBar(song, bar);
  const at = (t: number) => evs.flatMap((e) => e.filter((x) => x.start <= t && t < x.start + x.dur).flatMap((x) => x.midis));
  const struckAt = (t: number) => evs.flatMap((e) => e.filter((x) => x.start === t).flatMap((x) => x.midis));
  const onsets = [...new Set(evs.flatMap((e) => e.filter((x) => x.midis.length).map((x) => x.start)))].sort((a, b) => a - b);
  for (const t of onsets) {
    const b = beats.find((x) => x.start === t);
    if (!b) problems.push(`bar ${bar + 1} tick ${t}: expected ${sameNotes(struckAt(t))} struck, but no beat starts there`);
    else if (sameNotes(b.struck) !== sameNotes(struckAt(t))) problems.push(`bar ${bar + 1} tick ${t}: struck ${sameNotes(b.struck) || 'nothing'}, expected ${sameNotes(struckAt(t))}`);
  }
  for (const b of beats) {
    if (b.struck.length && !onsets.includes(b.start)) problems.push(`bar ${bar + 1} tick ${b.start}: struck ${sameNotes(b.struck)} where nothing new was expected`);
    if (sameNotes(b.sounding) !== sameNotes(at(b.start))) problems.push(`bar ${bar + 1} tick ${b.start}: sounding ${sameNotes(b.sounding) || 'nothing'}, expected ${sameNotes(at(b.start)) || 'nothing'}`);
  }
  return problems;
}

function compareAll(song: Song, voices: Voices, barTicks: (bar: number) => number): string[] {
  const n = Object.values(voices)[0].length;
  const problems: string[] = [];
  for (let i = 0; i < n; i++) {
    const bar: Record<string, string> = {};
    for (const [v, bars] of Object.entries(voices)) bar[v] = bars[i];
    problems.push(...compareBar(song, i, bar, barTicks(i)));
  }
  return problems;
}

/** One voice as a list of notes with absolute ticks (rests left out), bar by bar. */
function voiceNotes(bars: string[], barTicks: number): Array<{ bar: number; tick: number; abs: number; dur: number; midi: number }> {
  return bars.flatMap((text, bar) =>
    line(text)
      .filter((e) => e.midis.length === 1)
      .map((e) => ({ bar, tick: e.start, abs: bar * barTicks + e.start, dur: e.dur, midi: e.midis[0] })),
  );
}

/** The chord symbol in force at a bar and tick. */
function chordAt(song: Song, bar: number, tick: number): string | null {
  let best: { bar: number; tick: number; symbol: string } | null = null;
  for (const c of song.chords) if (c.bar < bar || (c.bar === bar && c.tick <= tick)) if (!best || c.bar > best.bar || (c.bar === best.bar && c.tick >= best.tick)) best = c;
  return best?.symbol ?? null;
}

/**
 * A voice's notes on the given strong ticks must be chord tones of the chord in force, or step
 * (one or two semitones) to the voice's next note, which is a chord tone of that chord: a passing
 * note, a neighbour or an appoggiatura.
 */
function strongBeatProblems(song: Song, notes: ReturnType<typeof voiceNotes>, strong: number[], label: string): string[] {
  const out: string[] = [];
  notes.forEach((n, i) => {
    if (!strong.includes(n.tick)) return;
    const symbol = chordAt(song, n.bar, n.tick);
    if (!symbol) return;
    const tones = new Set(chordPcs(symbol));
    if (tones.has(pc(n.midi))) return;
    const next = notes[i + 1];
    if (next && Math.abs(next.midi - n.midi) <= 2 && next.midi !== n.midi && tones.has(pc(next.midi))) return;
    out.push(`${label} bar ${n.bar + 1} tick ${n.tick}: ${name(n.midi)} is not in ${symbol} and does not step to a tone of it`);
  });
  return out;
}

/**
 * Parallel fifths or octaves: two voices moving the same way at the same moment, from a perfect
 * fifth (or octave) straight to another one. Each change of either voice is compared with the
 * sound just before it; a voice that holds or rests breaks the chain. Also flagged: the same
 * perfect interval on two successive quarter-note beats where both voices strike a new note.
 */
function parallels(a: ReturnType<typeof voiceNotes>, b: ReturnType<typeof voiceNotes>, label: string): string[] {
  const out: string[] = [];
  const sounding = (v: typeof a, t: number) => v.find((n) => n.abs <= t && t < n.abs + n.dur)?.midi ?? null;
  const changes = [...new Set([...a, ...b].map((n) => n.abs))].sort((x, y) => x - y);
  const both = changes.filter((t) => a.some((n) => n.abs === t) && b.some((m) => m.abs === t));
  for (const t1 of both) {
    const i = changes.indexOf(t1);
    if (i === 0) continue;
    const t0 = changes[i - 1];
    const a0 = sounding(a, t0), b0 = sounding(b, t0), a1 = sounding(a, t1), b1 = sounding(b, t1);
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    if (a0 === a1 || b0 === b1 || Math.sign(a1 - a0) !== Math.sign(b1 - b0)) continue;
    const i0 = pc(a0 - b0), i1 = pc(a1 - b1);
    if ((i0 === 7 && i1 === 7) || (i0 === 0 && i1 === 0)) out.push(`${label} at ${t0}->${t1}: ${name(a0)}/${name(b0)} to ${name(a1)}/${name(b1)}`);
  }
  const beats = both.filter((t) => t % 960 === 0);
  for (let i = 1; i < beats.length; i++) {
    const t0 = beats[i - 1];
    const t1 = beats[i];
    if (t1 - t0 !== 960) continue;
    const a0 = sounding(a, t0), b0 = sounding(b, t0), a1 = sounding(a, t1), b1 = sounding(b, t1);
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    if (a0 === a1 || b0 === b1 || Math.sign(a1 - a0) !== Math.sign(b1 - b0)) continue;
    const i0 = pc(a0 - b0), i1 = pc(a1 - b1);
    if ((i0 === 7 && i1 === 7) || (i0 === 0 && i1 === 0)) out.push(`${label} on the beats ${t0}->${t1}: ${name(a0)}/${name(b0)} to ${name(a1)}/${name(b1)}`);
  }
  return [...new Set(out)];
}

/** Intervals between successive notes of a line, in semitones. */
const steps = (ms: number[]) => ms.slice(1).map((m, i) => m - ms[i]);

/** Frets of every struck note of a track, bar by bar. */
function fretsByBar(song: Song, track = 0): number[][] {
  return song.tracks[track].measures.map((m) => m.beats.flatMap((b) => b.notes.filter((n) => !n.tie && n.fret > 0).map((n) => n.fret)));
}

function estimate(song: Song, track = 0) {
  return estimateDifficulty(song, { track: song.tracks[track].id });
}

// ---------------------------------------------------------------- batch-wide
describe('batch 16: every song', () => {
  it('is in the plan at the plan level, with the title and level the meta gives', async () => {
    for (const id of IDS) {
      const song = await load(id);
      const entry = songEntry(id)!;
      expect(entry.plan).toBe(id);
      expect(entry.level).toBe(PLAN_LEVEL[id]);
      expect(song.meta.difficulty).toBe(PLAN_LEVEL[id]);
      expect(song.meta.title).toBe(entry.title);
      expect(entry.composer).toBe('Sixstring Academy');
    }
  });

  it('can be fingered at every moment: everything sounding together fits one hand (the guitar engine agrees)', async () => {
    const problems: string[] = [];
    for (const id of IDS) {
      const song = await load(id);
      song.tracks[0].measures.forEach((m, bar) =>
        m.beats.forEach((b) => {
          const pos = b.notes.map((n) => ({ string: n.string, fret: n.fret }));
          if (pos.length > 1 && !Number.isFinite(simultaneousCost(pos, { tuning: song.tuning }))) problems.push(`${id} bar ${bar + 1} tick ${b.start}`);
        }),
      );
    }
    expect(problems).toEqual([]);
  });

  it('keeps every held note under the same finger until it ends (invention, fugue, chord melody)', async () => {
    // For each beat, every fingering the guitar engine accepts; then a walk through the piece
    // in which a tied note never changes finger. A held note that has to be re-fingered in
    // mid-air is a note the learner cannot actually hold.
    type Fingering = Map<number, number>;
    const problems: string[] = [];
    for (const id of ['st-two-voice-invention', 'st-fugue-exposition', 'st-chord-melody-2']) {
      const song = await load(id);
      const beats = song.tracks[0].measures.flatMap((m, bar) => m.beats.map((b) => ({ bar, b })));
      const options = beats.map(({ b }): Fingering[] => {
        const fretted = b.notes.filter((n) => n.fret > 0);
        const out: Fingering[] = [];
        const walk = (k: number, chosen: number[]) => {
          if (k === fretted.length) {
            const frets: Array<number | null> = Array(6).fill(null);
            const fingers: Array<number | null> = Array(6).fill(null);
            for (const n of b.notes) {
              frets[6 - n.string] = n.fret;
              if (n.fret === 0) fingers[6 - n.string] = 0;
            }
            fretted.forEach((n, i) => (fingers[6 - n.string] = chosen[i]));
            if (!checkVoicingFingering(frets, fingers as Array<0 | 1 | 2 | 3 | 4 | null>).length) out.push(new Map(fretted.map((n, i) => [n.string, chosen[i]])));
            return;
          }
          for (const f of [1, 2, 3, 4]) walk(k + 1, [...chosen, f]);
        };
        walk(0, []);
        return out;
      });
      let reach = options[0].map(() => true);
      for (let i = 1; i < beats.length; i++) {
        const held = beats[i].b.notes.filter((n) => n.tie && n.fret > 0).map((n) => n.string);
        const next = options[i].map((o) => options[i - 1].some((p, k) => reach[k] && held.every((s) => p.get(s) === o.get(s))));
        if (!next.some(Boolean)) {
          problems.push(`${id} bar ${beats[i].bar + 1} tick ${beats[i].b.start}`);
          reach = options[i].map(() => true);
        } else reach = next;
      }
    }
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------- chord melody
describe('batch 16: st-chord-melody-2 (jazz ballad, F major, AABA)', () => {
  /** The tune, top notes with their rhythm, written out from the composition plan. */
  const A = [
    'q C5 q A4 h E5', 'q. D5 e C5 h A4', 'q Bb4 q G4 h D5', 'q. C5 e Bb4 h G4',
    'q C5 q A4 h E5', 'q. D5 e E5 h C5', 'q D5 q C5 h Bb4',
  ];
  const TUNE = [
    ...A, 'h A4 q G4 q Bb4',
    ...A, 'h A4 h G4',
    'q A4 q D5 h F5', 'q. E5 e D5 h C#5', 'q D5 q A4 h C5', 'q. C5 e A4 h F#4',
    'q G4 q Bb4 h D5', 'q. D5 e C5 h B4', 'q Bb4 q D5 h F5', 'q. E5 e D5 h Bb4',
    ...A.slice(0, 6), 'q D5 q C5 h Bb4', 'w A4',
  ];
  /** The chords, beat 1 and (when it changes) beat 3. */
  const CHORDS = [
    'Fmaj7', 'Dm7', 'Gm7', 'C7', 'Fmaj7', 'Dm7', 'Gm7|C7', 'Fmaj7|C7',
    'Fmaj7', 'D7', 'Gm7', 'C7', 'Fmaj7', 'D7', 'Gm7|C7', 'Fmaj7|A7',
    'Dm7', 'A7', 'Dm7', 'D7', 'Gm7', 'G7', 'Gm7', 'C7',
    'Fmaj7', 'D7', 'Gm7', 'C7', 'Fmaj7', 'D7', 'Gm7|Gb7', 'Fmaj7',
  ];
  /** Every grip, with the notes it should sound low to high (standard tuning). */
  const GRIPS: Record<string, string> = {
    'Fmaj7=x-8-x-9-10-8': 'F3 E4 A4 C5',
    'Fmaj7=x-8-x-9-10-12': 'F3 E4 A4 E5',
    'Fmaj7=x-8-10-9-10-x': 'F3 C4 E4 A4',
    'Dm7=10-x-10-10-10-10': 'D3 C4 F4 A4 D5',
    'Dm7=10-x-10-10-10-x': 'D3 C4 F4 A4',
    'Dm7=10-x-10-10-13-x': 'D3 C4 F4 C5',
    'Dm7=10-x-10-10-10-13': 'D3 C4 F4 A4 F5',
    'D7=10-x-10-11-10-10': 'D3 C4 F#4 A4 D5',
    'D7=10-x-10-11-10-x': 'D3 C4 F#4 A4',
    'D7=10-x-10-11-13-x': 'D3 C4 F#4 C5',
    'D7=10-x-10-11-x-x': 'D3 C4 F#4',
    'Gm7=x-10-12-10-11-x': 'G3 D4 F4 Bb4',
    'Gm7=x-10-x-10-11-10': 'G3 F4 Bb4 D5',
    'Gm7=x-10-8-10-8-x': 'G3 Bb3 F4 G4',
    'Gm7=x-10-x-10-11-x': 'G3 F4 Bb4',
    'Gm7=x-10-x-10-11-13': 'G3 F4 Bb4 F5',
    'G7=x-10-x-10-12-10': 'G3 F4 B4 D5',
    'G7=x-10-x-10-12-x': 'G3 F4 B4',
    'C7=8-x-8-9-8-8': 'C3 Bb3 E4 G4 C5',
    'C7=8-x-8-9-8-x': 'C3 Bb3 E4 G4',
    'C7=8-x-8-9-11-x': 'C3 Bb3 E4 Bb4',
    'C7=x-x-10-12-11-12': 'C4 G4 Bb4 E5',
    'A7=x-0-11-12-x-x': 'A2 C#4 G4',
    'A7=x-0-11-12-10-12': 'A2 C#4 G4 A4 E5',
    'A7=x-0-x-12-10-9': 'A2 G4 A4 C#5',
    'Gb7=x-9-8-9-11-x': 'Gb3 Bb3 E4 Bb4',
  };
  const shapeText = (v: ReadonlyArray<number | null>) => v.map((f) => (f === null ? 'x' : String(f))).join('-');
  const sounds = (frets: string) => frets.split('-').flatMap((f, i) => (f === 'x' ? [] : [STANDARD[i] + Number(f)]));

  it.each(Object.entries(GRIPS))('%s sounds the notes written out for it, only chord tones, root lowest', (grip, notes) => {
    const [symbol, frets] = grip.split('=');
    expect(sameNotes(sounds(frets))).toBe(sameNotes(notes.split(' ').map((n) => noteToMidi(n))));
    const tones = new Set(chordPcs(symbol));
    for (const m of sounds(frets)) expect(tones.has(pc(m)), `${grip}: ${name(m)} is not in ${symbol}`).toBe(true);
    // Root, third and seventh are all there; the lowest note is the root.
    const [root, third, , seventh] = chordPcs(symbol);
    const got = new Set(sounds(frets).map(pc));
    expect(got.has(root) && got.has(third) && got.has(seventh), `${grip} lacks the root, third or seventh`).toBe(true);
    expect(pc(Math.min(...sounds(frets)))).toBe(root);
    expect(() => buildVoicing(symbol, frets)).not.toThrow();
  });

  it('plays exactly the tune written out for it, always as the top note', async () => {
    const song = await load('st-chord-melody-2');
    expect(song.bars.length).toBe(32);
    const problems: string[] = [];
    TUNE.forEach((text, bar) => {
      const want = line(text);
      const got = actualBar(song, bar).filter((b) => b.struck.length);
      const top = got.map((b) => `${b.start}:${name(Math.max(...b.struck))}:${b.dur}`).join(' ');
      const exp = want.map((e) => `${e.start}:${name(e.midis[0])}:${e.dur}`).join(' ');
      if (top !== exp) problems.push(`bar ${bar + 1}: ${top} but expected ${exp}`);
    });
    expect(problems).toEqual([]);
  });

  it('has the planned chords, every grip from the table, and only chord tones in every grip', async () => {
    const song = await load('st-chord-melody-2');
    const byBar = CHORDS.map((_, i) => [...new Set(song.chords.filter((c) => c.bar === i).map((c) => c.symbol))].join('|'));
    expect(byBar).toEqual(CHORDS);
    for (const c of song.chords) expect(Object.keys(GRIPS), `bar ${c.bar + 1}`).toContain(`${c.symbol}=${shapeText(c.voicing!)}`);
    const problems: string[] = [];
    song.tracks[0].measures.forEach((m, bar) =>
      m.beats.forEach((b) => {
        const symbol = chordAt(song, bar, b.start)!;
        const tones = new Set(chordPcs(symbol));
        if (b.notes.length > 1) {
          for (const n of b.notes) if (!tones.has(pc(n.midi))) problems.push(`bar ${bar + 1} tick ${b.start}: ${name(n.midi)} not in ${symbol}`);
          const want = song.chords.find((c) => c.bar === bar && c.tick === b.start);
          if (!want?.voicing) problems.push(`bar ${bar + 1} tick ${b.start}: a chord without its grip`);
          else if (sameNotes(b.notes.map((n) => n.midi)) !== sameNotes(sounds(shapeText(want.voicing)))) problems.push(`bar ${bar + 1} tick ${b.start}: plays ${sameNotes(b.notes.map((n) => n.midi))}, the grip says ${shapeText(want.voicing)}`);
        }
      }),
    );
    expect(problems).toEqual([]);
    // A melody note alone between the chords is a chord tone, or a passing, neighbour or escape
    // note: reached or left by a step (one or two semitones).
    const tune = TUNE.flatMap((text, bar) => line(text).map((e) => ({ bar, tick: e.start, midi: e.midis[0] })));
    const loose = tune.filter((n, i) => {
      const tones = new Set(chordPcs(chordAt(song, n.bar, n.tick)!));
      if (tones.has(pc(n.midi))) return false;
      const near = [tune[i - 1], tune[i + 1]].filter(Boolean).some((m) => Math.abs(m.midi - n.midi) <= 2 && m.midi !== n.midi);
      return !near || n.tick % 1920 === 0;
    });
    expect(loose.map((n) => `bar ${n.bar + 1} tick ${n.tick}: ${name(n.midi)}`)).toEqual([]);
  });

  it('is in AABA form: the same tune in every A, only the harmony changes', async () => {
    expect(TUNE.slice(8, 15)).toEqual(TUNE.slice(0, 7));
    expect(TUNE.slice(24, 30)).toEqual(TUNE.slice(0, 6));
    const song = await load('st-chord-melody-2');
    // Bar 2 -> bar 10: Dm7 -> D7 by one note, F4 to F#4 on string 3.
    const b2 = actualBar(song, 1)[0];
    const b10 = actualBar(song, 9)[0];
    const diff = b2.struck.filter((m, i) => b10.struck[i] !== m);
    expect(diff.map(name)).toEqual(['F4']);
    expect(b10.struck.map(name)).toContain('F#4');
    // Bar 7 -> bar 31: Gb7 replaces C7 on beat 3 with the same Bb and E above a bass a tritone away.
    const c7 = actualBar(song, 6).find((b) => b.start === 1920)!;
    const gb7 = actualBar(song, 30).find((b) => b.start === 1920)!;
    const upper = (ms: number[]) => sameNotes([...ms].sort((a, b) => a - b).slice(1));
    expect(upper(c7.struck)).toBe(upper(gb7.struck));
    expect(upper(c7.struck)).toBe('A#3+E4+A#4');
    expect(pc(Math.min(...c7.struck)) - pc(Math.min(...gb7.struck))).toBe(-6);
    // The bass falls by half steps into the last chord: G, Gb, F.
    const bass = [actualBar(song, 30)[0], gb7, actualBar(song, 31)[0]].map((b) => name(Math.min(...b.struck)));
    expect(bass).toEqual(['G3', 'F#3', 'F3']);
  });

  it('uses the secondary dominants as dominants: each one resolves down a fifth', async () => {
    const song = await load('st-chord-melody-2');
    const seq = song.chords.map((c) => c.symbol).filter((s, i, a) => s !== a[i - 1]);
    const rootPc = (symbol: string) => pc(noteToMidi(`${parseChord(symbol)!.root}4`));
    for (const [dom, target] of [['D7', 'Gm7'], ['A7', 'Dm7'], ['G7', 'C7']]) {
      const idx = seq.flatMap((s, i) => (s === dom ? [i] : []));
      expect(idx.length, `${dom} is used`).toBeGreaterThan(0);
      expect(pc(rootPc(dom) - rootPc(target)), `${dom} is the dominant of ${target}`).toBe(7);
      // It resolves to its target, or first to the minor seventh on its own root (G7 - Gm7 - C7,
      // the II7 - ii7 - V7 of the bridge), which is the ii of that same target.
      for (const i of idx) {
        const via = seq[i + 1] === target ? [seq[i + 1]] : [seq[i + 1], seq[i + 2]];
        expect(via[via.length - 1], `${dom} goes to ${target}`).toBe(target);
        if (via.length === 2) expect(via[0]).toBe(`${parseChord(dom)!.root}m7`);
      }
    }
    expect(seq.filter((s) => s === 'Gb7').length).toBe(1);
    expect(seq[seq.indexOf('Gb7') + 1]).toBe('Fmaj7');
  });

  it('keeps the tune in F major, except the third of each secondary dominant', async () => {
    const song = await load('st-chord-melody-2');
    const fMajor = new Set(scalePcs('F', 'major'));
    const top = TUNE.flatMap((text, bar) => line(text).map((e) => ({ bar, tick: e.start, midi: e.midis[0] })));
    for (const n of top) {
      if (fMajor.has(pc(n.midi))) continue;
      const symbol = chordAt(song, n.bar, n.tick)!;
      expect(['D7', 'A7', 'G7'], `bar ${n.bar + 1}: ${name(n.midi)}`).toContain(symbol);
      expect(chordPcs(symbol)[1], `bar ${n.bar + 1}: ${name(n.midi)} is the third of ${symbol}`).toBe(pc(n.midi));
    }
    expect(Math.min(...top.map((n) => n.midi))).toBe(noteToMidi('F#4'));
    expect(Math.max(...top.map((n) => n.midi))).toBe(noteToMidi('F5'));
    expect(song.key).toMatch(/^F/);
    expect(song.tuning).toEqual(STANDARD);
  });

  it('stays in positions VIII and X: no fret above 13, no fretted note below 8', async () => {
    const song = await load('st-chord-melody-2');
    const frets = fretsByBar(song).flat();
    expect(Math.max(...frets)).toBe(13);
    expect(Math.min(...frets)).toBe(8);
  });

  it('estimates below the plan (8): the estimate rates the chords as their easy open shapes', async () => {
    // The estimate sees a slow ballad (60 bpm) of quarter and eighth notes and scores Fmaj7, Dm7,
    // Gm7 and C7 by their easiest voicings. What makes it level 8 is the grips actually played:
    // barres at frets 8 and 10, four-fret stretches under a melody, and shifts every bar or two.
    const song = await load('st-chord-melody-2');
    const est = estimate(song);
    expect(est.level).toBeGreaterThanOrEqual(4);
    expect(est.level).toBeLessThanOrEqual(8);
    expect(est.factors.position).toBeGreaterThan(0.4);
    for (const grip of ['Dm7=10-x-10-10-10-10', 'Gb7=x-9-8-9-11-x', 'C7=8-x-8-9-8-8']) {
      const [symbol, frets] = grip.split('=');
      expect(buildVoicing(symbol, frets).difficulty, grip).toBeGreaterThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------- reading through the positions
describe('batch 16: st-read-shifting (positions I, V, VII, IX and XII)', () => {
  const TUNE = [
    // Position I, E major, 4/4
    'q E4 e. D#4 s E4 q B3 e G#3 E3', 'q A2 e C#3 E3 q. A3 e C#4', 's G#3 B3 E4 B3 q G#4 e3 F#4 E4 D#4 q E4', 'e D#4 C#4 B3 A3 q F#3 B2',
    'q E2 e. B2 s E3 q G#3 e B3 E4', 'q. G#4 e E4 q C#4 e G#3 C#4', 'q. A3 e C#4 q D#4 e F#4 A3', 'q G#3 e B3 E4 h B3',
    // Position V, F minor, 3/4
    'q Ab3 e C4 F4 e G4 F4', 'q. F4 e Eb4 q Db4', 'q Bb3 s Db4 F4 Bb4 F4 q Db4', 'q. C5 e Bb4 e G4 E4', 'e F4 Eb4 Db4 C4 q Db4', 'h. E4',
    // Position VII, C major, 6/8
    'e. E4 s F4 e G4 q C5 e G4', 'e. A4 s G4 e F4 q C4 e F4', 'e D3 A3 D4 F4 A4 D5', 'e. B4 s A4 e G#4 q. E4', 's A4 B4 C5 B4 A4 G#4 q. A4', 'q. B4 q. G#4',
    // Position IX, A major, 3/4
    'q E5 e3 C#5 B4 A4 q E4', 'q. F#4 e A4 q D5', 'e B4 C#5 D5 B4 q F#4', 'q G#4 s B4 C#5 D5 E5 q D5', 'q C#5 e A4 F#4 e C#4 A3', 'q D#5 e B4 A4 e F#4 B3',
    // Position XII, E major, 4/4
    'q E5 e. D#5 s E5 q B4 e G#4 E4', 'q A4 e C#5 E5 q. F#5 e E5', 's G#4 B4 E5 B4 q G#5 e3 F#5 E5 D#5 q E5', 'q. A4 e C#5 q D#5 e F#5 A4',
    'q G#4 e B4 E5 h G#5', 'w (E3 B3 E4 G#4 B4 E5)',
  ];
  const SECTIONS = [
    { from: 0, to: 8, time: '4/4', key: 'E', scale: ['E', 'major'], position: 1, extra: [] as string[] },
    { from: 8, to: 14, time: '3/4', key: 'Fm', scale: ['F', 'minor'], position: 5, extra: ['E'] },
    { from: 14, to: 20, time: '6/8', key: 'C', scale: ['C', 'major'], position: 7, extra: ['G#'] },
    { from: 20, to: 26, time: '3/4', key: 'A', scale: ['A', 'major'], position: 9, extra: ['D#'] },
    { from: 26, to: 32, time: '4/4', key: 'E', scale: ['E', 'major'], position: 12, extra: [] },
  ];
  const CHORDS = [
    'E', 'A', 'E', 'B7', 'E', 'C#m', 'F#m|B7', 'E',
    'Fm', 'Db', 'Bbm', 'C7', 'Db', 'C',
    'C', 'F', 'Dm', 'E', 'Am', 'E',
    'A', 'D', 'Bm', 'E7', 'F#m', 'B7',
    'E', 'A', 'E', 'F#m|B7', 'E', 'E',
  ];
  const ticks = (song: Song, bar: number) => song.bars[bar].time.numerator * (3840 / song.bars[bar].time.denominator);

  it('reads the melody written out for it, with its rhythm', async () => {
    const song = await load('st-read-shifting');
    expect(song.bars.length).toBe(32);
    expect(compareAll(song, { M: TUNE }, (bar) => ticks(song, bar))).toEqual([]);
  });

  it('changes key and meter where the plan says, and the teacher strums the planned chords', async () => {
    const song = await load('st-read-shifting');
    for (const s of SECTIONS) {
      for (let b = s.from; b < s.to; b++) expect(`${song.bars[b].time.numerator}/${song.bars[b].time.denominator}`, `bar ${b + 1}`).toBe(s.time);
      expect(song.bars[s.from].key ?? song.key, `bar ${s.from + 1}`).toBe(s.key);
    }
    expect(song.tempo).toHaveLength(1);
    const byBar = CHORDS.map((_, i) => song.chords.filter((c) => c.bar === i).map((c) => c.symbol).join('|'));
    expect(byBar).toEqual(CHORDS);
    expect(song.tracks[1].role).toBe('rhythm');
  });

  it('uses keys with up to four sharps or flats, and stays in each key (with the leading notes the harmony asks for)', async () => {
    const song = await load('st-read-shifting');
    const problems: string[] = [];
    for (const s of SECTIONS) {
      const allowed = new Set([...scalePcs(s.scale[0], s.scale[1]), ...s.extra.map((n) => pc(noteToMidi(`${n}4`)))]);
      for (let b = s.from; b < s.to; b++) for (const e of line(TUNE[b])) for (const m of e.midis) if (!allowed.has(pc(m))) problems.push(`bar ${b + 1}: ${name(m)} outside ${s.scale.join(' ')}`);
    }
    expect(problems).toEqual([]);
    // Signatures: E major 4 sharps, F minor 4 flats, C major none, A major 3 sharps.
    expect(scalePcs('E', 'major').filter((p) => [1, 3, 6, 8].includes(p))).toHaveLength(4);
    expect(scalePcs('F', 'minor').filter((p) => [10, 3, 8, 1].includes(p))).toHaveLength(4);
  });

  it('puts every note on a strong beat in its chord, or a step from it', async () => {
    const song = await load('st-read-shifting');
    const notes = TUNE.flatMap((text, bar) => line(text).filter((e) => e.midis.length === 1).map((e) => ({ bar, tick: e.start, abs: 0, dur: e.dur, midi: e.midis[0] })));
    const problems = SECTIONS.flatMap((s) => {
      const strong = s.time === '4/4' ? [0, 1920] : s.time === '6/8' ? [0, 1440] : [0];
      return strongBeatProblems(song, notes.filter((n) => n.bar >= s.from && n.bar < s.to), strong, 'melody');
    });
    expect(problems).toEqual([]);
  });

  it('plays each section in its position: frets from the index finger to the little finger (one fret of stretch)', async () => {
    const song = await load('st-read-shifting');
    const frets = fretsByBar(song);
    const problems: string[] = [];
    for (const s of SECTIONS) {
      const lo = s.position === 1 ? 1 : s.position;
      for (let b = s.from; b < s.to; b++) for (const f of frets[b]) if (f < lo || f > s.position + 4) problems.push(`bar ${b + 1}: fret ${f} is outside position ${s.position}`);
    }
    expect(problems).toEqual([]);
    // The shifts are prepared: an open string before the moves out of I and IX, the same note on a
    // new string from V to VII (E4: string 2 fret 5, then string 3 fret 9).
    const last = (bar: number) => actualBar(song, bar).filter((b) => b.struck.length).pop()!;
    expect([last(7).frets[0], last(25).frets[0]]).toEqual([0, 0]);
    expect([last(13).struck[0], last(13).strings[0], last(13).frets[0]]).toEqual([noteToMidi('E4'), 2, 5]);
    const first14 = actualBar(song, 14)[0];
    expect([first14.struck[0], first14.strings[0], first14.frets[0]]).toEqual([noteToMidi('E4'), 3, 9]);
    // Range: open low E to G# at fret 16.
    const all = TUNE.flatMap((t) => line(t).flatMap((e) => e.midis));
    expect(name(Math.min(...all))).toBe('E2');
    expect(name(Math.max(...all))).toBe('G#5');
  });

  it('gives fingerings only at the shifts', async () => {
    const song = await load('st-read-shifting');
    const fingered = song.tracks[0].measures.flatMap((m, bar) => m.beats.flatMap((b) => b.notes.filter((n) => n.finger !== undefined).map(() => bar + 1)));
    expect(fingered).toEqual([9, 15, 20, 27, 27]);
  });

  it('estimates below the plan (9): the reading and the keys, not the hands, are the hard part', async () => {
    // A single line at 80 bpm: the estimate sees sixteenths, triplets and frets up to 16
    // (about level 6). Level 9 comes from what it cannot see: five key signatures, three meters
    // and five positions in 32 bars, read at sight.
    const est = estimate(await load('st-read-shifting'));
    expect(est.level).toBeGreaterThanOrEqual(5);
    expect(est.level).toBeLessThanOrEqual(9);
    expect(est.factors.position).toBeGreaterThan(0.4);
    expect(est.factors.rhythm).toBeGreaterThan(0.4);
  });
});

// ---------------------------------------------------------------- two-voice invention
describe('batch 16: st-two-voice-invention (E minor, two voices)', () => {
  const SUBJECT = 'e E4 B4 s A4 G4 F#4 E4 e D#4 B3 q E4';
  const SUBJECT_BASS = 'e E3 B3 s A3 G3 F#3 E3 e D#3 B2 q E3';
  const CS = 'q G4 e C5 A4 s B4 A4 G4 F#4 e G4 E4';
  const T = [
    SUBJECT, CS,
    's C5 B4 A4 G4 e A4 E4 s B4 A4 G4 F#4 e G4 D#4', 'q C5 e B4 A4 q G4 s E4 F#4 G4 A4',
    'q C5 e B4 G4 e D4 A4 s G4 F#4 E4 D4', 'q B4 e A4 C5 e C5 E4 s A4 B4 C5 A4',
    's B4 C5 D5 B4 e C5 G4 s A4 B4 C5 A4 e F#4 A4', 'q B4 q G4 s D5 C5 B4 A4 e G4 F#4',
    'q B4 e A4 F#4 s A4 B4 C5 A4 e B4 G4', 'e G4 D5 s C5 B4 A4 G4 e F#4 D4 q G4',
    'h E4 q C5 e B4 D4', 'e C5 E4 s A4 B4 C5 A4 e D#4 B3 q A4',
    's G4 B4 A4 G4 s F#4 A4 G4 F#4 s E4 G4 F#4 E4 s D#4 F#4 E4 D#4', 's C5 A4 B4 C5 s A4 C5 B4 A4 e B4 F#4 e A4 D#4',
    's E4 F#4 G4 A4 e B4 G4 s A4 G4 F#4 E4 e D#4 F#4', 's F#4 G4 A4 B4 e C5 A4 s B4 A4 G4 F#4 q D#4',
    SUBJECT, CS,
    's E4 G4 C5 G4 s E4 A4 C5 A4 s F#4 A4 C5 A4 s D#4 F#4 B4 A4', 's G4 A4 B4 G4 s C5 B4 A4 C5 e B4 D#5 e A4 F#4',
    'q G4 e C5 A4 s B4 A4 G4 F#4 e G4 B4', 's C5 B4 A4 G4 s E4 F#4 G4 A4 q B4 q D#4',
    SUBJECT, 'w (E2 B2 E3 G#3 B3 E4)',
  ];
  const B = [
    'w r', SUBJECT_BASS,
    'h C3 e D#3 B2 e E3 B2', 'e A2 E3 e B2 D#3 h E3',
    'e A2 E3 s D3 C3 B2 A2 h D3', 'e G3 D4 s C4 B3 A3 G3 q C3 q D3',
    'e B2 G3 e E3 G3 e D3 F#3 e A3 C4', 'h G3 h r',
    'e G3 D4 s C4 B3 A3 G3 e F#3 D3 q G3', 'q B2 e E3 C3 s D3 C3 B2 A2 e B2 D3',
    'e C3 G3 s F#3 E3 D3 C3 e A2 E3 s D3 C3 B2 A2', 'q A2 e C3 E3 h B2',
    'q E3 D3 C3 B2', 'q A2 q C3 h B2',
    'w B2', 'w B2',
    'q G3 e C4 A3 s B3 A3 G3 F#3 e G3 E3', SUBJECT_BASS,
    'q E3 A2 F#3 B2', 'q E3 q A2 h B2',
    SUBJECT_BASS, 'e A2 C3 E3 C3 h B2',
    'w E2', 'w r',
  ];
  const midis = (text: string) => line(text).flatMap((e) => e.midis);

  it('plays exactly the two voices written out for it, with every held note tied', async () => {
    const song = await load('st-two-voice-invention');
    expect(song.bars.length).toBe(24);
    expect(song.tracks).toHaveLength(1);
    expect(compareAll(song, { T, B }, () => 3840)).toEqual([]);
  });

  it('imitates the subject between the voices: in E minor and in G major, in the treble and in the bass', () => {
    const shape = steps(midis(SUBJECT));
    expect(steps(midis(SUBJECT_BASS))).toEqual(shape);
    expect(midis(SUBJECT_BASS)).toEqual(midis(SUBJECT).map((m) => m - 12));
    // In G major (bars 9 and 10): the same rhythm and contour, a third higher (diatonic, so the
    // sizes of the steps follow the key).
    const contour = (ms: number[]) => steps(ms).map(Math.sign);
    expect(contour(midis(B[8]))).toEqual(contour(midis(SUBJECT)));
    expect(contour(midis(T[9]))).toEqual(contour(midis(SUBJECT)));
    expect(name(midis(B[8])[0])).toBe('G3');
    expect(name(midis(T[9])[0])).toBe('G4');
    for (const v of [B[8], T[9]]) expect(line(v).map((e) => e.dur)).toEqual(line(SUBJECT).map((e) => e.dur));
    // Entries of the subject in E minor: treble bars 1, 17, 23; bass bars 2, 18, 21.
    expect([0, 16, 22].map((i) => T[i])).toEqual([SUBJECT, SUBJECT, SUBJECT]);
    expect([1, 17, 20].map((i) => B[i])).toEqual([SUBJECT_BASS, SUBJECT_BASS, SUBJECT_BASS]);
  });

  it('swaps the countersubject below the subject in bar 17 (invertible at the octave)', () => {
    expect(midis(B[16])).toEqual(midis(CS).map((m) => m - 12));
    // Above the bass subject (bar 2) and below the treble subject (bar 17), the voices sound
    // a third, a sixth or an octave apart at every quarter-note beat.
    for (const [hi, lo] of [[CS, SUBJECT_BASS], [SUBJECT, B[16]]]) {
      for (const t of [0, 960, 1920, 2880]) {
        const at = (text: string) => line(text).find((e) => e.start <= t && t < e.start + e.dur)!.midis[0];
        expect([3, 4, 8, 9, 0], `beat at ${t}`).toContain(pc(at(hi) - at(lo)));
      }
    }
  });

  it('has a chord-tone or passing note on every strong beat, in both voices', async () => {
    const song = await load('st-two-voice-invention');
    const problems = [
      ...strongBeatProblems(song, voiceNotes(T.slice(0, 23), 3840), [0, 1920], 'treble'),
      ...strongBeatProblems(song, voiceNotes(B.slice(0, 23), 3840), [0, 1920], 'bass'),
    ];
    expect(problems).toEqual([]);
  });

  it('has no parallel fifths or octaves between the voices', () => {
    expect(parallels(voiceNotes(T.slice(0, 23), 3840), voiceNotes(B.slice(0, 23), 3840), 'treble/bass')).toEqual([]);
  });

  it('leads into the last entry with the leading note: D#4 rises to E4 while the bass falls B to E', async () => {
    // Not the seventh A4 leaping down to E4 in the same direction as the bass, which made
    // hidden octaves and left the seventh hanging.
    const song = await load('st-two-voice-invention');
    const t = midis(T[21]);
    expect(name(t.at(-1)!)).toBe('D#4');
    expect(name(midis(T[22])[0])).toBe('E4');
    expect(name(midis(B[21]).at(-1)!)).toBe('B2');
    expect(name(midis(B[22])[0])).toBe('E2');
    const beat4 = actualBar(song, 21).find((b) => b.start === 2880)!;
    expect([beat4.strings[0], beat4.frets[0]]).toEqual([3, 8]);
  });

  it('goes from E minor to G major and back, and ends on E major', async () => {
    const song = await load('st-two-voice-invention');
    expect(song.key).toMatch(/^Em|^E minor/);
    expect(song.bars[6].key).toBe('G');
    expect(song.bars[10].key).toBe('Em');
    // The G major cadence: D7 to G in bars 7-8, and G major chords around the middle entries.
    expect(chordAt(song, 6, 1920)).toBe('D7');
    expect(chordAt(song, 7, 0)).toBe('G');
    expect(chordAt(song, 23, 0)).toBe('E');
    const eMinor = new Set([...scalePcs('E', 'minor'), pc(noteToMidi('D#4'))]);
    for (let b = 0; b < 23; b++) for (const m of [...midis(T[b]), ...midis(B[b])]) expect(eMinor.has(pc(m)), `bar ${b + 1}: ${name(m)}`).toBe(true);
  });

  it('is playable in positions I to VII: no fret above 11 and no stretch wider than five frets', async () => {
    const song = await load('st-two-voice-invention');
    const frets = fretsByBar(song).flat();
    expect(Math.max(...frets)).toBeLessThanOrEqual(11);
    const all = [...T, ...B].flatMap(midis);
    expect(name(Math.min(...all))).toBe('E2');
    expect(name(Math.max(...all))).toBe('D#5');
    // Every simultaneity, held notes included, fits under one hand.
    for (const m of song.tracks[0].measures) for (const b of m.beats) {
      const fretted = b.notes.map((n) => n.fret).filter((f) => f > 0);
      if (fretted.length > 1) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
    }
  });

  it('estimates well below the plan (9): the estimate cannot see two independent voices', async () => {
    // At 56 bpm the notes are no faster than a level-4 single line, and that is what the estimate
    // scores. The difficulty of an invention is holding one line while the other moves: here
    // two thirds of all the beats have one voice held while the other plays.
    const song = await load('st-two-voice-invention');
    const est = estimate(song);
    expect(est.level).toBeGreaterThanOrEqual(3);
    expect(est.level).toBeLessThan(9);
    const beats = song.tracks[0].measures.flatMap((m) => m.beats);
    const heldUnder = beats.filter((b) => b.notes.some((n) => n.tie) && b.notes.some((n) => !n.tie)).length;
    expect(heldUnder / beats.length).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------- concert tremolo
describe('batch 16: st-concert-tremolo-etude (p a m i, D minor and D major)', () => {
  const x = (n: string, k: number) => Array<string>(k).fill(n);
  /** The tune, one note per eighth (each played three times by a m i). */
  const TUNE: string[][] = [
    x('A4', 6), [...x('Bb4', 4), ...x('A4', 2)], [...x('G4', 2), ...x('F4', 2), ...x('E4', 2)], x('F4', 6),
    [...x('A4', 2), ...x('D5', 2), ...x('F5', 2)], [...x('E5', 3), 'D5', ...x('C#5', 2)], [...x('D5', 4), ...x('A4', 2)], x('C#5', 6),
    x('A4', 6), [...x('Bb4', 4), ...x('A4', 2)], [...x('G4', 2), ...x('F4', 2), ...x('E4', 2)], [...x('F4', 2), ...x('A4', 2), ...x('C5', 2)],
    [...x('Bb4', 2), ...x('D5', 2), ...x('G5', 2)], [...x('G5', 3), 'F5', ...x('E5', 2)], [...x('E5', 2), ...x('D5', 2), ...x('C#5', 2)], x('D5', 6),
    x('A4', 6), [...x('B4', 4), ...x('A4', 2)], [...x('G4', 2), ...x('F#4', 2), ...x('E4', 2)], x('F#4', 6),
    [...x('A4', 2), ...x('D5', 2), ...x('F#5', 2)], [...x('F#5', 3), 'E5', ...x('D5', 2)], [...x('D5', 4), ...x('B4', 2)], x('A4', 6),
    [...x('A4', 2), ...x('F#5', 4)], [...x('E5', 2), ...x('C#5', 2), ...x('A#4', 2)], [...x('B4', 2), ...x('D5', 2), ...x('F#5', 2)], x('G5', 6),
    [...x('G5', 2), ...x('F5', 2), ...x('D5', 2)], [...x('F#5', 3), 'E5', ...x('F#5', 2)], [...x('E5', 2), ...x('D5', 2), ...x('C#5', 2)], x('D5', 6),
    x('A4', 6), [...x('B4', 4), ...x('A4', 2)], [...x('Bb4', 4), ...x('A4', 2)], [...x('G4', 2), ...x('F#4', 2), ...x('E4', 2)],
    x('F#4', 6), [...x('A4', 2), ...x('D5', 2), ...x('F#5', 2)], x('F#5', 6),
  ];
  /** The thumb, one note per eighth. */
  const DM_LOW = 'D3 A3 D4 A3 D4 A3';
  const DM_HIGH = 'D3 A3 F4 A3 F4 A3';
  const GM_D = 'D3 G3 D4 G3 D4 G3';
  const A7_LOW = 'A2 G3 C#4 G3 C#4 G3';
  const D_HIGH = 'D3 A3 F#4 A3 F#4 A3';
  const G_D = 'D3 G3 G4 G3 G4 G3';
  const THUMB: string[] = [
    DM_LOW, GM_D, A7_LOW, DM_LOW, DM_HIGH, 'A2 C#4 E4 C#4 E4 C#4', DM_HIGH, 'A2 C#4 G4 C#4 E4 C#4',
    'D3 F3 D4 F3 D4 F3', GM_D, A7_LOW, DM_LOW, 'G3 D4 G3 D4 G3 D4', 'E3 Bb3 D4 Bb3 D4 Bb3', 'A2 C#4 E4 C#4 G4 C#4', DM_HIGH,
    D_HIGH, G_D, A7_LOW, DM_LOW, D_HIGH, 'D3 F#4 A2 F#4 A2 F#4', 'G3 D4 G3 D4 G3 D4', 'A2 C#4 G4 C#4 E4 C#4',
    D_HIGH, 'F#3 C#4 E4 C#4 E4 C#4', 'D3 B3 F#4 B3 F#4 D3', 'G3 B3 D4 B3 D4 B3', 'G3 Bb3 D4 Bb3 D4 Bb3', 'A2 D4 F#4 D4 F#4 D4', 'A2 C#4 E4 C#4 G4 C#4', D_HIGH,
    D_HIGH, G_D, G_D, A7_LOW, DM_LOW, D_HIGH, D_HIGH,
  ];
  const CHORDS = [
    'Dm', 'Gm/D', 'A7', 'Dm', 'Dm', 'A', 'Dm', 'A7', 'Dm', 'Gm/D', 'A7', 'Dm7', 'Gm', 'Em7b5', 'A7', 'Dm',
    'D', 'G/D', 'A7', 'D', 'D', 'D', 'G', 'A7', 'D', 'F#7', 'Bm/D', 'G', 'Gm7', 'D/A', 'A7', 'D',
    'D', 'G/D', 'Gm/D', 'A7', 'D', 'D', 'D', 'D',
  ];

  it('plays every eighth as one p a m i group: a thumb note, then the tune note three times', async () => {
    const song = await load('st-concert-tremolo-etude');
    expect(song.bars.length).toBe(40);
    expect(song.bars.every((b) => b.time.numerator === 3 && b.time.denominator === 4)).toBe(true);
    const problems: string[] = [];
    for (let bar = 0; bar < 39; bar++) {
      const beats = actualBar(song, bar);
      if (beats.length !== 24 || beats.some((b) => b.dur !== 120 || b.struck.length !== 1)) {
        problems.push(`bar ${bar + 1}: not 24 single thirty-second notes`);
        continue;
      }
      const thumb = THUMB[bar].split(' ');
      for (let k = 0; k < 6; k++) {
        const [p, a, m, i] = beats.slice(4 * k, 4 * k + 4);
        if (name(p.struck[0]) !== name(noteToMidi(thumb[k]))) problems.push(`bar ${bar + 1} eighth ${k + 1}: thumb ${name(p.struck[0])}, expected ${thumb[k]}`);
        for (const t of [a, m, i]) if (name(t.struck[0]) !== name(noteToMidi(TUNE[bar][k]))) problems.push(`bar ${bar + 1} eighth ${k + 1}: tune ${name(t.struck[0])}, expected ${TUNE[bar][k]}`);
        if (p.strings[0] < 3) problems.push(`bar ${bar + 1} eighth ${k + 1}: the thumb is on string ${p.strings[0]}`);
        for (const t of [a, m, i]) if (t.strings[0] > 2) problems.push(`bar ${bar + 1} eighth ${k + 1}: the tune is on string ${t.strings[0]}`);
        if (a.strings[0] !== m.strings[0] || m.strings[0] !== i.strings[0]) problems.push(`bar ${bar + 1} eighth ${k + 1}: a m i change string`);
      }
    }
    expect(problems).toEqual([]);
    // The last bar: a held D major chord with the tune's F# on top.
    const last = actualBar(song, 39);
    expect(last).toHaveLength(1);
    expect(sameNotes(last[0].struck)).toBe(sameNotes(['D3', 'A3', 'F#4', 'A4', 'F#5'].map((n) => noteToMidi(n))));
  });

  it('marks p a m i in bars 1 and 17 and lets the bass that starts each bar ring', async () => {
    const song = await load('st-concert-tremolo-etude');
    for (const bar of [0, 16]) expect(actualBar(song, bar).slice(0, 4).map((b) => b.pluck[0])).toEqual(['p', 'a', 'm', 'i']);
    const bars = song.tracks[0].measures.slice(0, 39);
    expect(bars.every((m) => m.beats[0].notes[0].letRing)).toBe(true);
    // Only that note: "let ring" on every thumb note would bury the tab in markings.
    expect(bars.flatMap((m) => m.beats.slice(1)).some((b) => b.notes.some((n) => n.letRing))).toBe(false);
    // The bass rings on: no other thumb note of the bar stops its string (at most it strikes it again).
    for (const m of bars) {
      const bass = m.beats[0].notes[0];
      const others = m.beats.filter((_, k) => k > 0 && k % 4 === 0).map((b) => b.notes[0]);
      expect(others.some((n) => n.string === bass.string && n.midi !== bass.midi)).toBe(false);
    }
    // ... and the hand can keep it: the let-ring bass, held down with every other note of its
    // bar, always fits one hand. (Bar 13 once had G3 at string 5 fret 10 under G5 at fret 15.)
    const stuck: string[] = [];
    bars.forEach((m, bar) => {
      const bass = m.beats[0].notes[0];
      for (const b of m.beats) {
        const pos = [bass, ...b.notes.filter((n) => n.string !== bass.string)].map((n) => ({ string: n.string, fret: n.fret }));
        if (!Number.isFinite(simultaneousCost(pos, { tuning: song.tuning }))) stuck.push(`bar ${bar + 1} tick ${b.start}: ${pos.map((p) => `${p.string}:${p.fret}`).join(' ')}`);
      }
    });
    expect(stuck).toEqual([]);
    expect([bars[12].beats[0].notes[0].string, bars[12].beats[0].notes[0].fret]).toEqual([3, 0]);
  });

  it('has the planned chords, and every thumb note is a tone of its chord', async () => {
    const song = await load('st-concert-tremolo-etude');
    expect(song.chords.map((c) => c.symbol)).toEqual(CHORDS);
    expect(song.chords.every((c, i) => c.bar === i && c.tick === 0)).toBe(true);
    const problems: string[] = [];
    THUMB.forEach((t, bar) => {
      const tones = new Set(chordPcs(CHORDS[bar]));
      for (const n of t.split(' ')) if (!tones.has(pc(noteToMidi(n)))) problems.push(`bar ${bar + 1}: ${n} not in ${CHORDS[bar]}`);
    });
    expect(problems).toEqual([]);
  });

  it('starts every bar of the tune on a chord tone, or a step from one', async () => {
    const song = await load('st-concert-tremolo-etude');
    // The tune as sustained notes (repeated eighths joined), checked on beat 1.
    const notes = TUNE.flatMap((bar, b) => bar.map((n, k) => ({ bar: b, tick: k * 480, abs: b * 2880 + k * 480, dur: 480, midi: noteToMidi(n) })))
      .filter((n, i, a) => i === 0 || a[i - 1].midi !== n.midi || n.tick === 0);
    expect(strongBeatProblems(song, notes, [0], 'tune')).toEqual([]);
  });

  it('is in D minor, then D major from bar 17, with the borrowed and secondary chords the plan names', async () => {
    const song = await load('st-concert-tremolo-etude');
    expect(song.key).toMatch(/^Dm|^D minor/);
    expect(song.bars[16].key).toBe('D');
    const minor = new Set([...scalePcs('D', 'minor'), pc(noteToMidi('C#4'))]);
    const major = new Set([...scalePcs('D', 'major'), ...['A#', 'F', 'Bb'].map((n) => pc(noteToMidi(`${n}4`)))]);
    const problems: string[] = [];
    TUNE.forEach((bar, b) => {
      for (const n of [...bar, ...THUMB[b].split(' ')]) if (!(b < 16 ? minor : major).has(pc(noteToMidi(n)))) problems.push(`bar ${b + 1}: ${n}`);
    });
    expect(problems).toEqual([]);
    // F becomes F# when the tune comes back in major (bars 3 and 19).
    expect(TUNE[2]).toContain('F4');
    expect(TUNE[18]).toContain('F#4');
  });

  it('keeps the tune on strings 1 and 2 up to the twelfth position (G5 at fret 15)', async () => {
    const song = await load('st-concert-tremolo-etude');
    const frets = fretsByBar(song).flat();
    expect(Math.max(...frets)).toBe(15);
    const tune = TUNE.flat().map((n) => noteToMidi(n));
    expect(name(Math.min(...tune))).toBe('E4');
    expect(name(Math.max(...tune))).toBe('G5');
    expect(song.tuning).toEqual(STANDARD);
    // Each beat holds one chord shape: the frets of a bar fit under one hand position.
    const problems: string[] = [];
    song.tracks[0].measures.slice(0, 39).forEach((m, bar) => {
      for (let beat = 0; beat < 3; beat++) {
        const fretted = m.beats.slice(beat * 8, beat * 8 + 8).flatMap((b) => b.notes.map((n) => n.fret)).filter((f) => f > 0);
        if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 5) problems.push(`bar ${bar + 1} beat ${beat + 1}: frets ${Math.min(...fretted)}-${Math.max(...fretted)}`);
      }
    });
    expect(problems).toEqual([]);
  });

  it('estimates within two levels of the plan (10): the estimate does not count endurance', async () => {
    // Over eight notes a second for nearly two minutes, frets to 15 and constant shifts: the
    // estimate gives 8. Level 10 is the stamina and evenness of a concert tremolo, which the
    // estimate does not measure.
    const est = estimate(await load('st-concert-tremolo-etude'));
    expect(est.level).toBeGreaterThanOrEqual(8);
    expect(est.factors.speed).toBeGreaterThan(0.8);
  });
});

// ---------------------------------------------------------------- fugue exposition
describe('batch 16: st-fugue-exposition (three voices, drop D)', () => {
  const SUBJECT = ['q D4 e. D4 s E4 q F4 e. F4 s G4', 'q A4 e Bb4 A4 e G4 F4 e E4 C#4'];
  const ANSWER = ['q A3 e. A3 s B3 q C4 e. C4 s D4', 'q E4 e F4 E4 e D4 C4 e B3 G#3'];
  const CS = ['q C4 q F4 q E4 q A4', 'q C5 q A4 q F4 q D4'];
  const BASS_SUBJECT = ['q D2 e. D2 s E2 q F2 e. F2 s G2', 'q A2 e Bb2 A2 e G2 F2 e E2 C#3'];
  const CS_LOW = ['q F3 q Bb3 q A3 q D4', 'q F4 q D4 q Bb3 q G3'];
  /** The countersubject above the fourth entry: the bars 3-4 pair moved up a fourth, note for note. */
  const CS_HIGH = ['q F4 q Bb4 q A4 q D5', 'q F5 q D5 q Bb4 q G4'];
  const S = [
    ...SUBJECT, ...CS,
    'q A4 e. A4 s G4 q F4 e. F4 s E4', 'q F4 e Bb4 A4 e E4 G4 q F4',
    'q A4 q G4 h r', 'h r q D4 q E4',
    'q A4 e. A4 s G4 q F4 e. F4 s E4', 'h F4 h Bb4', 'q Bb4 e. Bb4 s A4 q G4 e. G4 s F4', 'q A4 q G4 h E4',
    'q r q E4 e. E4 s F4 q G4', 'q A4 q F4 q G4 q E4', 'q D5 e. D5 s E5 q F5 e. F5 s G5', 'q F5 e E5 D5 e C#5 E5 q A4',
    ...CS_HIGH,
    'q F4 e. F4 s G4 q A4 e. A4 s Bb4', 'q Bb4 q A4 q G4 q E4', 'q F4 q Bb4 q A4 q G4', 'w (D2 D3 A3 D4 F#4)',
  ];
  const A = [
    'w r', 'w r', ...ANSWER,
    'q A3 h D4 q C#4', 'h D4 q C#4 q D4',
    ...CS_LOW,
    // Bar 9: the seventh of A7 (G3) falls to F3, so the episode starts on a full D minor chord.
    'h F3 q D4 q C#4', 'q D4 e. D4 s E4 q F4 e. F4 s G4', 'h D4 h C#4', 'h D4 h C#4',
    'q A3 e. A3 s Bb3 q C#4 e. C#4 s D4', 'h D4 h C#4', 'h F4 q A4 q r', 'q A4 q Bb4 q G4 q E4',
    ...SUBJECT,
    'h D4 h F4', 'h D4 h C#4', 'h D4 h C#4', 'w r',
  ];
  const B = [
    'w r', 'w r', 'w r', 'w r', 'w r', 'w r',
    ...BASS_SUBJECT,
    'h D3 q G2 q A2', 'h D3 h Bb2', 'h Bb2 h A2', 'q D3 q G2 h A2',
    'w A2', 'w A2', 'w A2', 'w A2',
    'w D2', 'w D2', 'w D2', 'w D2', 'q Bb2 q G2 h A2', 'w r',
  ];
  const LAST = S.length - 1;
  const midis = (text: string[]) => text.flatMap((t) => line(t).flatMap((e) => e.midis));
  const durs = (text: string[]) => text.flatMap((t) => line(t).map((e) => e.dur));

  it('is in drop D and plays exactly the three voices written out for it', async () => {
    const song = await load('st-fugue-exposition');
    expect(song.tuning).toEqual(DROP_D);
    expect(song.bars.length).toBe(22);
    expect(compareAll(song, { S, A, B }, () => 3840)).toEqual([]);
  });

  it('has the subject, the answer at the fifth, and a third entry in the bass', () => {
    // Answer: the subject on A, the fifth of D minor (a real answer: every interval kept,
    // so it sounds in A minor: B natural and the leading note G#).
    expect(steps(midis(ANSWER))).toEqual(steps(midis(SUBJECT)));
    expect(pc(midis(ANSWER)[0] - midis(SUBJECT)[0])).toBe(7);
    expect(durs(ANSWER)).toEqual(durs(SUBJECT));
    // Third entry: the subject two octaves lower, from the open low D; the last note, C#, is an
    // octave higher because C#2 is below the guitar.
    const low = midis(BASS_SUBJECT);
    const sub = midis(SUBJECT);
    expect(low.slice(0, -1)).toEqual(sub.slice(0, -1).map((m) => m - 24));
    expect(low[low.length - 1]).toBe(sub[sub.length - 1] - 12);
    expect(durs(BASS_SUBJECT)).toEqual(durs(SUBJECT));
    // Entries in order: top voice bars 1-2, middle voice bars 3-4, bass bars 7-8.
    expect(S.slice(0, 2)).toEqual(SUBJECT);
    expect(A.slice(2, 4)).toEqual(ANSWER);
    expect(B.slice(6, 8)).toEqual(BASS_SUBJECT);
  });

  it('accompanies the answer and the third entry with the same countersubject', () => {
    expect(S.slice(2, 4)).toEqual(CS);
    expect(A.slice(6, 8)).toEqual(CS_LOW);
    expect(midis(CS_LOW)).toEqual(midis(CS).map((m) => m - 7));
    // Invertible at the octave: on every beat it sounds a third, a sixth or an octave from the
    // entry it accompanies, whether it lies above it (all three times here) or below it.
    for (const [cs, entry] of [[CS, ANSWER], [CS_LOW, BASS_SUBJECT], [CS_HIGH, SUBJECT]]) {
      for (let bar = 0; bar < 2; bar++) for (const t of [0, 960, 1920, 2880]) {
        const at = (text: string) => line(text).find((e) => e.start <= t && t < e.start + e.dur)!.midis[0];
        expect([3, 4, 8, 9, 0], `bar ${bar + 1} beat at ${t}`).toContain(pc(at(cs[bar]) - at(entry[bar])));
      }
    }
  });

  it('brings the subject back in the middle voice over the low D pedal (bars 17-18), countersubject above', () => {
    // A fourth entry, in the tonic: the subject at its first pitch, and above it the
    // countersubject exactly as over the answer (bars 3-4), a fourth higher.
    expect(A.slice(16, 18)).toEqual(SUBJECT);
    expect(S.slice(16, 18)).toEqual(CS_HIGH);
    expect(midis(CS_HIGH)).toEqual(midis(CS).map((m) => m + 5));
    expect(midis(SUBJECT)).toEqual(midis(ANSWER).map((m) => m + 5));
    expect(B.slice(16, 18)).toEqual(['w D2', 'w D2']);
    // It ends on the leading note C#4, which rises to D4 as the close begins, while the top
    // voice's G4 falls to F4: the tritone of A7 resolving inwards.
    expect(name(midis([A[17]]).at(-1)!)).toBe('C#4');
    expect(name(midis([A[18]])[0])).toBe('D4');
    expect(name(midis([S[17]]).at(-1)!)).toBe('G4');
    expect(name(midis([S[18]])[0])).toBe('F4');
    // About 24 bars, as the plan asks.
    expect(S.length).toBe(22);
  });

  it('resolves the seventh of A7 into the episode (bar 8 -> 9) and starts it on a full D minor chord', async () => {
    const song = await load('st-fugue-exposition');
    // The countersubject ends on G3, the seventh of A7, which falls a step to F3.
    expect(name(midis([A[7]]).at(-1)!)).toBe('G3');
    expect(name(midis([A[8]])[0])).toBe('F3');
    const first = actualBar(song, 8)[0];
    expect(new Set(first.struck.map(pc))).toEqual(new Set(chordPcs('Dm')));
  });

  it('has a chord-tone or passing note on every strong beat, in every voice', async () => {
    const song = await load('st-fugue-exposition');
    const problems = [
      ...strongBeatProblems(song, voiceNotes(S.slice(0, LAST), 3840), [0, 1920], 'top'),
      ...strongBeatProblems(song, voiceNotes(A.slice(0, LAST), 3840), [0, 1920], 'middle'),
      ...strongBeatProblems(song, voiceNotes(B.slice(0, LAST), 3840), [0, 1920], 'bass'),
    ];
    expect(problems).toEqual([]);
  });

  it('has no parallel fifths or octaves between any two voices', () => {
    const v = { top: voiceNotes(S.slice(0, LAST), 3840), middle: voiceNotes(A.slice(0, LAST), 3840), bass: voiceNotes(B.slice(0, LAST), 3840) };
    expect([...parallels(v.top, v.middle, 'top/middle'), ...parallels(v.top, v.bass, 'top/bass'), ...parallels(v.middle, v.bass, 'middle/bass')]).toEqual([]);
  });

  it('stays in D minor (with the answer in A minor), has pedals on A and D, and ends on D major', async () => {
    const song = await load('st-fugue-exposition');
    expect(song.key).toMatch(/^Dm|^D minor/);
    const allowed = new Set([...scalePcs('D', 'minor'), ...['C#', 'B', 'G#'].map((n) => pc(noteToMidi(`${n}4`)))]);
    for (let b = 0; b < LAST; b++) for (const m of [...midis([S[b]]), ...midis([A[b]]), ...midis([B[b]])]) expect(allowed.has(pc(m)), `bar ${b + 1}: ${name(m)}`).toBe(true);
    expect(B.slice(12, 16).every((t) => t === 'w A2')).toBe(true);
    expect(B.slice(16, 20).every((t) => t === 'w D2')).toBe(true);
    expect(chordAt(song, LAST, 0)).toBe('D');
    // The pedals are the open strings: A (string 5) and the low D (string 6, tuned down).
    expect(actualBar(song, 12)[0].frets).toContain(0);
    expect(actualBar(song, 16)[0].strings).toContain(6);
  });

  it('is playable: no fret above 15, and every simultaneity fits under one hand', async () => {
    const song = await load('st-fugue-exposition');
    expect(Math.max(...fretsByBar(song).flat())).toBe(15);
    for (const m of song.tracks[0].measures) for (const b of m.beats) {
      const fretted = b.notes.map((n) => n.fret).filter((f) => f > 0);
      if (fretted.length > 1) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
    }
    const all = [...S, ...A, ...B].flatMap((t) => midis([t]));
    expect(name(Math.min(...all))).toBe('D2');
    expect(name(Math.max(...all))).toBe('G5');
  });

  it('estimates well below the plan (10): the estimate cannot see three independent voices', async () => {
    // Quarters and eighths at 60 bpm score as a level-6 single line with some high frets.
    // A fugue's difficulty is voicing three lines on one instrument: here most beats hold
    // at least one tied note under the notes being played.
    const song = await load('st-fugue-exposition');
    const est = estimate(song);
    expect(est.level).toBeGreaterThanOrEqual(4);
    expect(est.level).toBeLessThan(10);
    const beats = song.tracks[0].measures.flatMap((m) => m.beats);
    const threeAtOnce = beats.filter((b) => b.notes.length >= 3).length;
    expect(threeAtOnce / beats.length).toBeGreaterThan(0.4);
  });
});
