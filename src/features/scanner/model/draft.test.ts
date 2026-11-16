/**
 * The proofreading draft against real readings of the sheet-reader's fixture pages: the same song
 * as the reader's own converter, marks in step with the notes, bass tab read as bass, and the two
 * songs made from a draft always valid.
 */
import { describe, expect, it } from 'vitest';
import { recognizeDocument } from '@/core/omr/pipeline';
import { omrToSong } from '@/core/omr/to-song';
import { loadFixture } from '@/core/omr/eval/fixtures';
import { readPngGray } from '@/core/omr/eval/png';
import { fileURLToPath } from 'node:url';
import { validateSong } from '@/core/song';
import { type Draft, GUESS, LINE_TUNINGS, badBars, buildDraft, checkBar, finalSong, fretChord, possibleFret, viewSong } from './draft';
import { setValue, songToSave } from './edit';
import { isTabEvent } from '@/core/omr/types';

function errors(song: Parameters<typeof validateSong>[0]) {
  return validateSong(song, { notation: false }).filter((i) => i.level === 'error');
}

function marksInStep(d: Draft): boolean {
  return d.song.tracks[0].measures.every((m, bar) => m.beats.length === d.marks[bar].beats.length && m.beats.every((b, i) => b.notes.length === d.marks[bar].beats[i].notes.length));
}

describe('buildDraft', () => {
  it('reads a notation + tab page into the same song as omrToSong, with every note traced back to the page', async () => {
    const fx = loadFixture('linked-ode-bravura-150');
    const doc = await recognizeDocument([fx.gray]);
    const draft = buildDraft(doc);
    const ref = omrToSong(doc).song;
    const mine = finalSong(draft).song;
    expect(mine.bars).toEqual(ref.bars);
    expect(mine.tracks[0].measures).toEqual(ref.tracks[0].measures);
    expect(mine.key).toBe(ref.key);
    expect(errors(mine)).toEqual([]);
    expect(draft.hasNotation).toBe(true);
    expect(draft.notationOnly).toBe(false);
    expect(draft.tabLines).toBe(6);
    expect(marksInStep(draft)).toBe(true);
    // Eight bars of 4/4, every one adding up, every note with its tab number and note head on the page.
    expect(draft.song.bars).toHaveLength(8);
    expect(badBars(draft.song)).toEqual([]);
    const marks = draft.marks.flatMap((b) => b.beats.flatMap((x) => x.notes));
    expect(marks.length).toBeGreaterThan(25);
    expect(marks.every((m) => m.boxes.length === 2 && m.ids.length === 2 && m.confidence >= 0.5)).toBe(true);
    expect(draft.marks.every((b) => b.box && b.box.w > 0 && b.source === 'both')).toBe(true);
    // The first bar of Ode to Joy: B B C D on the B string, frets 0 0 1 3.
    const first = draft.song.tracks[0].measures[0].beats.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join(' '));
    expect(first).toEqual(['2:0', '2:0', '2:1', '2:3']);
  }, 90_000);

  it('reads a four-line tab staff as bass in standard tuning (the page assembler labels it guitar)', async () => {
    const dir = fileURLToPath(new URL('../../../core/omr/tab/fixtures/', import.meta.url));
    const gray = readPngGray(`${dir}bass-carlito-150.png`);
    const doc = await recognizeDocument([gray]);
    const staff = doc.pages[0].systems[0].staves[0];
    expect(staff.lineCount).toBe(4);
    const draft = buildDraft(doc);
    expect(draft.tabLines).toBe(4);
    expect(draft.song.tuning).toEqual(LINE_TUNINGS[4].tuning);
    expect(draft.song.tracks[0].role).toBe('bass');
    expect(draft.notes.join(' ')).toMatch(/4 lines.*bass/);
    const notes = draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes.length).toBeGreaterThan(5);
    // Pitch follows bass tuning: string 4 open is E1 (28), not a guitar's G3.
    for (const n of notes) expect(n.midi).toBe(LINE_TUNINGS[4].tuning[4 - n.string] + n.fret);
    expect(errors(viewSong(draft))).toEqual([]);
  }, 90_000);

  it('gives notation-only music strings and frets low on the neck', async () => {
    const fx = loadFixture('ode-bravura-150');
    const doc = await recognizeDocument([fx.gray]);
    const draft = buildDraft(doc);
    expect(draft.notationOnly).toBe(true);
    expect(draft.tabLines).toBe(0);
    expect(marksInStep(draft)).toBe(true);
    const notes = draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes.every((n) => n.fret <= 5)).toBe(true);
    expect(errors(finalSong(draft).song)).toEqual([]);
  }, 90_000);

  it('turns a fret read past the last fret (two numbers read as one on a photo) into a marked guess, so the song can be saved', async () => {
    // A phone photo of an unseen tab page read "9" "2" as 92 and "4" "8" as 48: the library refused the song.
    const fx = loadFixture('linked-ode-bravura-150');
    const doc = await recognizeDocument([fx.gray]);
    const tab = doc.pages[0].systems[0].staves.find((st) => st.kind === 'tab')!;
    const ev = tab.measures[1].events.find((e) => isTabEvent(e) && e.notes.length)!;
    if (!isTabEvent(ev)) throw new Error('no tab event');
    ev.notes[0].fret = 92;
    ev.notes[0].alternatives = [];
    const draft = buildDraft(doc);
    const notes = draft.song.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => b.notes));
    expect(notes.every((n) => n.fret >= 0 && n.fret <= 24)).toBe(true);
    const marks = draft.marks.flatMap((b) => b.beats.flatMap((x) => x.notes));
    const guess = marks.find((m) => m.reasons[0]?.startsWith('Read as 92'));
    expect(guess).toBeDefined();
    expect(guess!.confidence).toBeLessThan(GUESS);
    expect(guess!.altFrets).toEqual([2]);
    expect(errors(songToSave(draft).song)).toEqual([]);
    expect(marksInStep(draft)).toBe(true);
  }, 90_000);

  it('keeps frets on the neck as read and offers the digits of an impossible one', () => {
    expect(possibleFret(12, [17, 30])).toEqual({ fret: 12, alts: [17], impossible: false });
    expect(possibleFret(92)).toEqual({ fret: 9, alts: [2], impossible: true });
    expect(possibleFret(48, [8, 4])).toEqual({ fret: 8, alts: [4], impossible: true });
    expect(possibleFret(99)).toEqual({ fret: 9, alts: [], impossible: true });
  });

  it('starts a valid empty draft when nothing was read', () => {
    const draft = buildDraft({ pages: [], measures: [], context: {}, warnings: [] });
    expect(draft.song.bars).toHaveLength(1);
    expect(draft.notes[0]).toMatch(/No music/);
    expect(errors(viewSong(draft))).toEqual([]);
  });
});

describe('viewSong and finalSong', () => {
  it('show a bar that is too long in a time signature that holds it, and cut it when saving', async () => {
    const fx = loadFixture('linked-ode-bravura-100');
    const draft = buildDraft(await recognizeDocument([fx.gray]));
    // Bar 1: make the first quarter a half: the bar is now a quarter too long.
    const r = setValue(draft, { bar: 0, beat: 0 }, { base: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(checkBar(r.draft.song, 0)).toMatchObject({ ok: false, diff: 960, text: 'A quarter too long' });
    const view = viewSong(r.draft);
    expect(view.bars[0].time).toEqual({ numerator: 5, denominator: 4 });
    expect(view.tracks[0].measures[0].beats).toHaveLength(4);
    expect(errors(view)).toEqual([]);
    const saved = finalSong(r.draft);
    expect(saved.song.bars[0].time).toEqual({ numerator: 4, denominator: 4 });
    expect(saved.warnings[0]).toMatch(/Bar 1 was a quarter too long/);
    expect(errors(saved.song)).toEqual([]);
  }, 90_000);

  it('fill a short bar with a rest', async () => {
    const fx = loadFixture('linked-ode-bravura-100');
    const draft = buildDraft(await recognizeDocument([fx.gray]));
    const r = setValue(draft, { bar: 1, beat: 0 }, { base: 8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(checkBar(r.draft.song, 1).text).toBe('An eighth is missing');
    const view = viewSong(r.draft);
    const beats = view.tracks[0].measures[1].beats;
    expect(beats[beats.length - 1]).toMatchObject({ notes: [], duration: 480 });
    expect(errors(view)).toEqual([]);
    expect(finalSong(r.draft).warnings[0]).toMatch(/Bar 2 was an eighth short/);
  }, 90_000);
});

describe('fretChord', () => {
  it('puts each pitch of a chord on its own string, low frets first', () => {
    const tuning = LINE_TUNINGS[6].tuning;
    const c = fretChord([48, 52, 55, 60, 64], tuning);
    expect(new Set(c.map((n) => n.string)).size).toBe(5);
    for (const n of c) expect(tuning[6 - n.string] + n.fret).toBe(n.midi);
  });
});
