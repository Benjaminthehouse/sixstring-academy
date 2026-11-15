import { describe, expect, it } from 'vitest';
import plan from './repertoire.json';
import { chordFitsScale, chordTones, chroma, getScale, isNote, noteToMidi, parseTimeSignature, scaleNotes } from '@/core/theory';
import { voicingProblem } from '@/core/guitar';

/** A public-domain or traditional piece the app will teach with. */
interface Piece {
  id: string;
  title: string;
  origin: string;
  year: string;
  publicDomain: { music: string; lyrics: string };
  level: number;
  arrangement: string;
  key: string;
  meter: string;
  tempo: number;
  teaches: string[];
  notes: string;
}
/** An original study to be composed for the app. */
interface Study {
  id: string;
  title: string;
  level: number;
  goal: string;
  spec: string;
  teaches: string[];
}
/** A technique exercise with a tempo ladder. */
interface Technique {
  id: string;
  title: string;
  hand: string;
  level: number;
  pattern: string;
  tempo: { start: number; goal: number; step: number };
  watchFor: string[];
  teaches: string[];
}
/** The whole plan file. */
interface RepertoirePlan {
  pieces: Piece[];
  studies: Study[];
  technique: Technique[];
}

const data = plan as RepertoirePlan;
const { pieces, studies, technique } = data;
const all = [...pieces, ...studies, ...technique];

const ARRANGEMENTS = ['single-line melody', 'melody with chords', 'strum and sing', 'fingerstyle solo', 'classical solo', 'flatpicking', 'duet'];
const HANDS = ['fretting', 'picking', 'both'];
/** Sounding MIDI of the open strings in standard tuning, indexed by string number (1 = high E). */
const OPEN = [0, 64, 59, 55, 50, 45, 40];

/** Every free-text field of an entry, so claims anywhere in it get checked. */
function texts(e: Piece | Study | Technique): string[] {
  const out: string[] = [e.title, ...e.teaches];
  if ('notes' in e) out.push(e.origin, e.year, e.publicDomain.music, e.publicDomain.lyrics, e.notes, e.key);
  if ('spec' in e) out.push(e.goal, e.spec);
  if ('pattern' in e) out.push(e.pattern, ...e.watchFor);
  return out;
}

const SHAPE = String.raw`(?:[x0-9]{6}|(?:[x0-9]{1,2}-){5}[x0-9]{1,2})`;

describe('repertoire plan: shape', () => {
  it('has exactly the three lists, each entry with exactly the agreed fields', () => {
    expect(Object.keys(data).sort()).toEqual(['pieces', 'studies', 'technique']);
    const pieceKeys = ['arrangement', 'id', 'key', 'level', 'meter', 'notes', 'origin', 'publicDomain', 'teaches', 'tempo', 'title', 'year'];
    for (const p of pieces) {
      expect(Object.keys(p).sort(), p.id).toEqual(pieceKeys);
      expect(Object.keys(p.publicDomain).sort(), p.id).toEqual(['lyrics', 'music']);
    }
    for (const s of studies) expect(Object.keys(s).sort(), s.id).toEqual(['goal', 'id', 'level', 'spec', 'teaches', 'title']);
    for (const t of technique) {
      expect(Object.keys(t).sort(), t.id).toEqual(['hand', 'id', 'level', 'pattern', 'teaches', 'tempo', 'title', 'watchFor']);
      expect(Object.keys(t.tempo).sort(), t.id).toEqual(['goal', 'start', 'step']);
    }
  });

  it('has the planned number of entries', () => {
    expect(pieces.length).toBeGreaterThanOrEqual(80);
    expect(pieces.length).toBeLessThanOrEqual(110);
    expect(studies.length).toBeGreaterThanOrEqual(60);
    expect(studies.length).toBeLessThanOrEqual(90);
    expect(technique.length).toBeGreaterThanOrEqual(50);
    expect(technique.length).toBeLessThanOrEqual(70);
  });

  it('uses unique kebab-case ids across all three lists', () => {
    const ids = all.map((e) => e.id);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('keeps every text field non-empty and in plain ASCII', () => {
    for (const e of all) {
      expect(e.teaches.length, e.id).toBeGreaterThan(0);
      for (const t of texts(e)) {
        expect(t.trim().length, `${e.id}: empty text`).toBeGreaterThan(0);
        expect(t, `${e.id}: non-ASCII text`).toMatch(/^[\x20-\x7e]*$/);
      }
    }
  });
});

describe('repertoire plan: levels', () => {
  it('uses whole-number levels from 1 to 10', () => {
    for (const e of all) {
      expect(Number.isInteger(e.level), e.id).toBe(true);
      expect(e.level, e.id).toBeGreaterThanOrEqual(1);
      expect(e.level, e.id).toBeLessThanOrEqual(10);
    }
  });

  it('has pieces and studies at every level from 1 to 10', () => {
    for (let level = 1; level <= 10; level++) {
      expect(pieces.some((p) => p.level === level), `pieces at level ${level}`).toBe(true);
      expect(studies.some((s) => s.level === level), `studies at level ${level}`).toBe(true);
    }
  });
});

describe('repertoire plan: pieces', () => {
  it('gives every piece a public-domain reason for the music and the lyrics', () => {
    for (const p of pieces) {
      expect(p.publicDomain.music.trim().length, p.id).toBeGreaterThanOrEqual(15);
      expect(p.publicDomain.lyrics.trim().length, p.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('names no author who died after 1954', () => {
    for (const p of pieces) {
      const years = [
        ...[...p.origin.matchAll(/\((?:c\. )?\d{4}-(?:c\. )?(\d{4})\)/g)].map((m) => Number(m[1])),
        ...[...p.origin.matchAll(/died (\d{4})/g)].map((m) => Number(m[1])),
      ];
      for (const y of years) expect(y, `${p.id}: author died ${y}`).toBeLessThanOrEqual(1954);
    }
  });

  it('dates every piece to 1930 or earlier', () => {
    for (const p of pieces) {
      for (const m of p.year.matchAll(/\d{4}/g)) expect(Number(m[0]), `${p.id}: ${p.year}`).toBeLessThanOrEqual(1930);
    }
  });

  it('leaves out songs that feel traditional but are not in the public domain', () => {
    const banned = [
      'scarborough fair', 'freight train', 'wildwood flower', 'house of the rising sun', 'edelweiss', 'this land is your land',
      'kumbaya', 'cielito lindo', 'guantanamera', 'we wish you a merry christmas', 'happy birthday', 'wild mountain thyme',
      'wellerman', 'tom dooley', 'malaguena', 'romance', 'st. louis blues', 'circle be unbroken', "i'll fly away", 'la bamba',
      'el condor pasa', 'careless love', 'birmingham jail', 'leaving of liverpool', 'black is the colour', 'black is the color',
      // added by the rights review
      'red river valley', 'angeline', 'this little light', 'whole world in his hands', 'kookaburra', 'love me tender',
      'wheels on the bus', 'lavender blue', 'katyusha', 'hava nagila', 'john henry blues',
    ];
    for (const p of pieces) {
      const title = p.title.toLowerCase();
      for (const b of banned) expect(title.includes(b), `${p.id}: ${b}`).toBe(false);
    }
  });

  it('uses only the agreed arrangement types', () => {
    for (const p of pieces) expect(ARRANGEMENTS, p.id).toContain(p.arrangement);
  });

  it('gives every piece a key the theory engine understands', () => {
    for (const p of pieces) {
      const m = /^([A-G](?:#|b)?) ([a-z-]+)$/.exec(p.key);
      expect(m, `${p.id}: key '${p.key}'`).not.toBeNull();
      expect(isNote(m![1]), p.id).toBe(true);
      expect(getScale(m![2]), `${p.id}: scale '${m![2]}'`).not.toBeNull();
    }
  });

  it('gives every piece a meter and a sensible tempo', () => {
    for (const p of pieces) {
      expect(parseTimeSignature(p.meter), `${p.id}: meter '${p.meter}'`).not.toBeNull();
      expect(Number.isInteger(p.tempo), p.id).toBe(true);
      expect(p.tempo, p.id).toBeGreaterThanOrEqual(40);
      expect(p.tempo, p.id).toBeLessThanOrEqual(200);
    }
  });
});

describe('repertoire plan: technique', () => {
  it('uses the agreed hand values', () => {
    for (const t of technique) expect(HANDS, t.id).toContain(t.hand);
  });

  it('has tempo ladders that climb to their goal in whole steps', () => {
    for (const t of technique) {
      const { start, goal, step } = t.tempo;
      for (const n of [start, goal, step]) expect(Number.isInteger(n), t.id).toBe(true);
      expect(start, t.id).toBeGreaterThanOrEqual(30);
      expect(goal, t.id).toBeLessThanOrEqual(240);
      expect(goal, t.id).toBeGreaterThanOrEqual(start);
      if (goal === start) expect(step, t.id).toBe(0);
      else {
        expect(step, t.id).toBeGreaterThan(0);
        expect((goal - start) % step, `${t.id}: ladder misses its goal`).toBe(0);
      }
      expect(t.watchFor.length, t.id).toBeGreaterThan(0);
    }
  });
});

describe('repertoire plan: musical claims match the engines', () => {
  it('names the right note for every "string N fret M (X)" in standard tuning', () => {
    let checked = 0;
    for (const e of all) {
      for (const text of texts(e)) {
        for (const m of text.matchAll(/string ([1-6]) fret (\d{1,2}) \(([A-G](?:##|#|bb|b)?)(\d)?\)/g)) {
          const midi = OPEN[Number(m[1])] + Number(m[2]);
          expect(midi % 12, `${e.id}: ${m[0]}`).toBe(chroma(m[3]));
          if (m[4] !== undefined) expect(midi, `${e.id}: ${m[0]}`).toBe(noteToMidi(m[3] + m[4]));
          checked++;
        }
        for (const m of text.matchAll(/open string ([1-6]) \(([A-G](?:#|b)?)\)/g)) {
          expect(OPEN[Number(m[1])] % 12, `${e.id}: ${m[0]}`).toBe(chroma(m[2]));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('builds every "Chord (shape)" it names, and names a chord for every shape', () => {
    let checked = 0;
    for (const e of all) {
      for (const text of texts(e)) {
        const shapes = [...text.matchAll(new RegExp(String.raw`\((${SHAPE})(?=[),\s])`, 'g'))].length;
        const named = [...text.matchAll(new RegExp(String.raw`(?<![\w#])([A-G](?:#|b)?[a-z0-9#]*) \((${SHAPE})\)`, 'g'))];
        expect(named.length, `${e.id}: a shape without a chord symbol in "${text.slice(0, 60)}..."`).toBe(shapes);
        for (const m of named) {
          expect(voicingProblem(m[1], m[2]), `${e.id}: ${m[1]} (${m[2]})`).toBeNull();
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
});

/** Every "Chord (shape)" an entry names, as [symbol, shape, index in the text]. */
function namedShapes(text: string): [string, string, number][] {
  const re = new RegExp(String.raw`(?<![\w#])([A-G](?:#|b)?[a-z0-9#]*) \((${SHAPE})\)`, 'g');
  return [...text.matchAll(re)].map((m) => [m[1], m[2], m.index ?? 0]);
}

describe('repertoire plan: teaching order and safety', () => {
  it('keeps the first-weeks melodies (levels 1 and 2) inside their key', () => {
    let checked = 0;
    for (const p of pieces.filter((x) => x.level <= 2)) {
      const [tonic, scale] = p.key.split(' ');
      const inKey = new Set(scaleNotes(tonic, scale).map((n) => chroma(n)));
      for (const m of p.notes.matchAll(/string ([1-6]) fret (\d{1,2}) \(([A-G](?:#|b)?)\)/g)) {
        expect(inKey.has((OPEN[Number(m[1])] + Number(m[2])) % 12), `${p.id}: ${m[0]} is outside ${p.key}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('asks a piece at levels 2 to 4 only for chord shapes already practised, or offers an easier one', () => {
    const taughtAt = new Map<string, number>();
    for (const e of [...studies, ...technique]) {
      for (const text of texts(e)) {
        for (const [sym, shape] of namedShapes(text)) {
          const k = `${sym} (${shape})`;
          taughtAt.set(k, Math.min(taughtAt.get(k) ?? 99, e.level));
        }
      }
    }
    const ready = (k: string, level: number) => (taughtAt.get(k) ?? 99) <= level;
    for (const p of pieces.filter((x) => x.level >= 2 && x.level <= 4)) {
      for (const [sym, shape, at] of namedShapes(p.notes)) {
        const k = `${sym} (${shape})`;
        if (ready(k, p.level)) continue;
        // "Bm (x24432), or the open Bm7 (x20202)": the easier alternative must follow at once and be practised.
        const after = p.notes.slice(at + k.length, at + k.length + 60);
        const alt = /^,? or\b[a-z ,]*?([A-G](?:#|b)?[a-z0-9#]*) \(([x0-9-]+)\)/.exec(after);
        expect(alt && ready(`${alt[1]} (${alt[2]})`, p.level), `${p.id} (level ${p.level}) asks for ${k}, first practised at level ${taughtAt.get(k) ?? 'never'}`).toBe(true);
      }
    }
  });

  it('keeps every mode-study vamp inside its mode and makes it sound the colour note', () => {
    const modes: Record<string, string> = {
      ionian: 'major', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', aeolian: 'minor', locrian: 'locrian',
    };
    for (const [name, scale] of Object.entries(modes)) {
      const s = studies.find((x) => x.id === `st-mode-${name}`);
      expect(s, name).toBeDefined();
      const notes = scaleNotes('A', scale);
      const vamp = /Vamp ([^.;:]*)/.exec(s!.spec)![1];
      const chords = namedShapes(vamp).map(([sym]) => sym);
      expect(chords.length, s!.id).toBeGreaterThanOrEqual(2);
      for (const c of chords) expect(chordFitsScale(c, notes), `${s!.id}: ${c} in A ${scale}`).toBe(true);
      const colours = /Colour notes?: ([A-G](?:#|b)?)(?: and ([A-G](?:#|b)?))?/.exec(s!.spec)!;
      const sounding = new Set(chords.flatMap((c) => chordTones(c).map((t) => chroma(t.note))));
      for (const colour of [colours[1], colours[2]].filter(Boolean)) {
        expect(notes.map((n) => chroma(n)), `${s!.id}: colour ${colour}`).toContain(chroma(colour));
        expect(sounding.has(chroma(colour)), `${s!.id}: the vamp never sounds ${colour}`).toBe(true);
      }
    }
  });

  it('warns about strain wherever an exercise can hurt', () => {
    const risky = [
      'tech-spider', 'tech-stretch', 'tech-anchored-fingers', 'tech-trills', 'tech-barre-strength', 'tech-palm-mute',
      'tech-tremolo-picking', 'tech-rasgueado', 'tech-bend-whole-step', 'tech-bend-minor-third',
    ];
    for (const id of risky) {
      const t = technique.find((x) => x.id === id);
      expect(t, id).toBeDefined();
      const text = [t!.pattern, ...t!.watchFor].join(' ').toLowerCase();
      expect(/stop|strain|ache|aching|pain|burn|cramp|sore|forc/.test(text), `${id} has no strain warning`).toBe(true);
    }
  });

  it('keeps chord-change ladders reachable for the level they sit at', () => {
    for (const t of technique.filter((x) => x.id.startsWith('tech-changes'))) {
      expect(t.tempo.goal, `${t.id}: changes per minute`).toBeLessThanOrEqual(t.level <= 4 ? 72 : 96);
    }
  });
});
