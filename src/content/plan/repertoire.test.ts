import { describe, expect, it } from 'vitest';
import plan from './repertoire.json';
import { chroma, getScale, isNote, noteToMidi, parseTimeSignature } from '@/core/theory';
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
