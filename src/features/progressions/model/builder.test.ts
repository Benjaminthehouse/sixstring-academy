import { describe, expect, it } from 'vitest';
import { backingFor, progressionInKey } from '@/content/progressions';
import {
  MAX_SLOTS, STARTER_DRAFT, addSlot, degreeChord, draftBars, draftCadences, draftLayout, draftProgression, draftTitle,
  latestCadence, moveSlot, palette, removeSlot, replaceSlot, sanitizeDraft, setKey, setLength, suggestNext, transposeDraft,
  type BuilderDraft,
} from './builder';

const draft = (tokens: string[], patch: Partial<BuilderDraft> = {}): BuilderDraft => ({
  ...STARTER_DRAFT,
  tonic: 'C',
  ...patch,
  slots: tokens.map((token) => ({ token, length: 1 })),
});

describe('editing a draft', () => {
  it('adds, removes, moves, replaces and sets lengths', () => {
    let d = draft(['I']);
    d = addSlot(d, 'IV');
    d = addSlot(d, 'V', 2);
    expect(d.slots).toEqual([{ token: 'I', length: 1 }, { token: 'IV', length: 1 }, { token: 'V', length: 2 }]);
    d = moveSlot(d, 2, -1);
    expect(d.slots.map((s) => s.token)).toEqual(['I', 'V', 'IV']);
    d = moveSlot(d, 0, -1);
    expect(d.slots.map((s) => s.token)).toEqual(['I', 'V', 'IV']);
    d = setLength(d, 0, 0.5);
    expect(d.slots[0].length).toBe(0.5);
    d = replaceSlot(d, 1, 'vi');
    expect(d.slots[1]).toEqual({ token: 'vi', length: 2 });
    d = removeSlot(d, 0);
    expect(d.slots.map((s) => s.token)).toEqual(['vi', 'IV']);
  });

  it('refuses tokens the engine cannot read and stops at the limit', () => {
    const d = draft(['I']);
    expect(addSlot(d, 'XYZ')).toBe(d);
    expect(addSlot(d, '')).toBe(d);
    expect(replaceSlot(d, 0, 'Q7')).toBe(d);
    let full = draft([]);
    for (let i = 0; i < MAX_SLOTS + 5; i++) full = addSlot(full, 'I');
    expect(full.slots).toHaveLength(MAX_SLOTS);
  });

  it('names a draft by its numerals', () => {
    expect(draftTitle(draft(['I', 'V', 'vi', 'IV']))).toBe('I–V–vi–IV');
    expect(draftTitle(draft(['I', 'I', 'IV']))).toBe('I–IV');
    expect(draftTitle(draft([]))).toBe('New progression');
  });
});

describe('laying a draft out in bars', () => {
  it('gives each one-bar chord its own bar', () => {
    expect(draftLayout(draft(['I', 'V', 'vi', 'IV'])).bars).toEqual([['I'], ['V'], ['vi'], ['IV']]);
  });

  it('shares a bar between two half-bar chords and repeats long chords bar by bar', () => {
    const d: BuilderDraft = { ...draft([]), slots: [{ token: 'ii', length: 0.5 }, { token: 'V', length: 0.5 }, { token: 'I', length: 2 }] };
    const l = draftLayout(d);
    expect(l.bars).toEqual([['ii', 'V'], ['I'], ['I']]);
    expect(l.barSlots).toEqual([[0, 1], [2], [2]]);
    expect(l.padded).toBe(false);
  });

  it('carries a chord that starts halfway through a bar into the next, and fills an odd half at the end', () => {
    const d: BuilderDraft = { ...draft([]), slots: [{ token: 'I', length: 0.5 }, { token: 'IV', length: 1 }, { token: 'V', length: 1 }] };
    const l = draftLayout(d);
    expect(l.bars).toEqual([['I', 'IV'], ['IV', 'V'], ['V']]);
    expect(l.padded).toBe(true);
    expect(draftBars(d)).toBe(3);
  });

  it('turns into a progression the band can play, chords spelled in the key', () => {
    const d = draft(['I', 'V/7', 'vi', 'IV'], { tonic: 'D' });
    const p = draftProgression(d)!;
    expect(p.chart).toBe('I | V/7 | vi | IV');
    const r = progressionInKey(p, 'D');
    expect(r.chords).toEqual(['D', 'A/C#', 'Bm', 'G']);
    const setup = backingFor(p, 'D', { loop: true });
    expect(setup.bars).toHaveLength(4);
    expect(setup.options.style).toBe(d.style);
    expect(draftProgression(draft([]))).toBeNull();
  });
});

describe('the palette', () => {
  it('offers the seven chords of a major key with their roles', () => {
    const p = palette({ tonic: 'G', mode: 'major', sevenths: false, advanced: false });
    expect(p.diatonic.map((c) => c.token)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(p.diatonic.map((c) => c.symbol)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
    expect(p.diatonic[0].role).toBe('home');
    expect(p.diatonic[4].role).toBe('tension');
    expect(p.borrowed).toEqual([]);
    expect(p.secondary).toEqual([]);
  });

  it('offers sevenths, and the major V and vii° in a minor key', () => {
    const maj7 = palette({ tonic: 'C', mode: 'major', sevenths: true, advanced: false });
    expect(maj7.diatonic.map((c) => c.symbol)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
    const minor = palette({ tonic: 'A', mode: 'minor', sevenths: false, advanced: false });
    expect(minor.diatonic.map((c) => c.symbol)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G', 'E', 'G#dim']);
    expect(minor.diatonic.filter((c) => c.degree !== null)).toHaveLength(7);
  });

  it('offers borrowed and secondary chords to advanced learners, spelled in the key', () => {
    const p = palette({ tonic: 'C', mode: 'major', sevenths: false, advanced: true });
    const borrowed = Object.fromEntries(p.borrowed.map((c) => [c.token, c.symbol]));
    expect(borrowed).toMatchObject({ iv: 'Fm', bVII: 'Bb', bVI: 'Ab', bIII: 'Eb', bII: 'Db' });
    const secondary = Object.fromEntries(p.secondary.map((c) => [c.token, c.symbol]));
    expect(secondary).toMatchObject({ 'V7/ii': 'A7', 'V7/V': 'D7', 'V7/vi': 'E7', subV7: 'Db7' });
    for (const c of [...p.borrowed, ...p.secondary]) expect(c.explanation.length).toBeGreaterThan(0);
  });

  // Review: the secondary tiles were labelled "Applied", a word the builder never teaches. Each
  // one now says, in this key, the chord it leads to.
  it('says which chord each secondary dominant leads to, in plain words', () => {
    const p = palette({ tonic: 'G', mode: 'major', sevenths: false, advanced: true });
    const leads = Object.fromEntries(p.secondary.map((c) => [c.token, c.leadsTo]));
    expect(leads).toMatchObject({ 'V7/ii': 'Am', 'V7/iii': 'Bm', 'V7/IV': 'C', 'V7/V': 'D', 'V7/vi': 'Em', subV7: 'G' });
    expect(p.diatonic.every((c) => c.leadsTo === null) && p.borrowed.every((c) => c.leadsTo === null)).toBe(true);
    const minor = palette({ tonic: 'A', mode: 'minor', sevenths: false, advanced: true });
    expect(minor.secondary.every((c) => typeof c.leadsTo === 'string' && c.leadsTo.length > 0)).toBe(true);
  });

  it('maps the number keys to the key’s own degrees', () => {
    const d = { tonic: 'E', mode: 'minor' as const, sevenths: false, advanced: true };
    expect(degreeChord(d, 1)?.symbol).toBe('Em');
    expect(degreeChord(d, 7)?.symbol).toBe('D');
    expect(degreeChord(d, 8)).toBeNull();
  });
});

describe('suggestions and cadences', () => {
  it('suggests the home chord for an empty draft, then the engine’s likely next chords', () => {
    expect(suggestNext(draft([]))[0]).toMatchObject({ token: 'I', symbol: 'C' });
    const after = suggestNext(draft(['IV']));
    expect(after.map((s) => s.token)).toEqual(expect.arrayContaining(['V', 'I']));
    expect(after[0].reason.length).toBeGreaterThan(0);
    const applied = suggestNext(draft(['V7/ii']));
    expect(applied[0]).toMatchObject({ token: 'ii', symbol: 'Dm' });
    const total = after.reduce((n, s) => n + s.probability, 0);
    expect(total).toBeLessThanOrEqual(1.001);
  });

  it('names the cadences as they form', () => {
    expect(latestCadence(draft(['I', 'IV', 'I']))?.cadence.type).toBe('plagal');
    expect(latestCadence(draft(['ii', 'V', 'I']))?.cadence.type).toBe('authentic');
    expect(latestCadence(draft(['I', 'V', 'vi']))?.cadence.type).toBe('deceptive');
    expect(latestCadence(draft(['I', 'IV', 'V']))?.cadence.type).toBe('half');
    expect(latestCadence(draft(['I', 'vi']))).toBeNull();
  });

  it('counts a half cadence only where the phrase stops, and the loop back to the top', () => {
    const d = draft(['I', 'V', 'vi', 'IV']);
    const all = draftCadences(d);
    expect(all.find((c) => c.cadence.type === 'half')).toBeUndefined();
    expect(all.find((c) => c.cadence.type === 'deceptive')?.at).toBe(2);
    const looped = draftCadences(draft(['I', 'vi', 'IV', 'V']));
    expect(looped.find((c) => c.loop)?.cadence.type).toBe('authentic');
  });

  it('works in a minor key', () => {
    expect(latestCadence(draft(['i', 'iv', 'V', 'i'], { tonic: 'A', mode: 'minor' }))?.cadence.type).toBe('authentic');
  });
});

describe('keys', () => {
  it('transposes by semitones with sensible spellings, keeping the numerals', () => {
    const d = draft(['I', 'IV', 'V']);
    expect(transposeDraft(d, 2).tonic).toBe('D');
    expect(transposeDraft(d, 1).tonic).toBe('Db');
    expect(transposeDraft(d, -2).tonic).toBe('Bb');
    expect(transposeDraft(d, 12).tonic).toBe('C');
    expect(transposeDraft(d, 3).slots).toEqual(d.slots);
    const minor = draft(['i', 'iv'], { tonic: 'A', mode: 'minor' });
    expect(transposeDraft(minor, 4).tonic).toBe('C#');
  });

  it('switches key and mode, respelling the tonic', () => {
    const d = setKey(draft(['I', 'IV']), 'A#');
    expect(d.tonic).toBe('Bb');
    expect(setKey(draft(['I']), 'C', 'minor').mode).toBe('minor');
    expect(setKey(draft(['I']), 'H').tonic).toBe('C');
  });
});

describe('sanitizing stored drafts', () => {
  it('keeps what is valid and drops the rest', () => {
    const d = sanitizeDraft({
      name: 'x'.repeat(100), tonic: 'F#', mode: 'minor', style: 'nope', tempo: 9999,
      slots: [{ token: 'i', length: 2 }, { token: 'bogus', length: 1 }, { token: 'V7', length: 3 }, 'junk'],
      savedId: '../etc', sevenths: 1,
    });
    expect(d.name).toHaveLength(60);
    expect(d.tonic).toBe('F#');
    expect(d.mode).toBe('minor');
    expect(d.style).toBe(STARTER_DRAFT.style);
    expect(d.tempo).toBeLessThan(400);
    expect(d.slots).toEqual([{ token: 'i', length: 2 }, { token: 'V7', length: 1 }]);
    expect(d.savedId).toBeNull();
    expect(d.sevenths).toBe(true);
  });

  it('falls back to the starter for nothing at all', () => {
    expect(sanitizeDraft(undefined)).toEqual(STARTER_DRAFT);
    expect(sanitizeDraft('text')).toEqual(STARTER_DRAFT);
  });
});
