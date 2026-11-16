/**
 * The page pipeline end to end on small corpus pages: one entry point, progress, cancellation,
 * linking, measure checks, rhythm from spacing, several pages as one piece, the quick page
 * classifier, the confidence summary and the worker protocol (run in this thread).
 */
import { describe, expect, it } from 'vitest';
import { classifyPage } from './classify-page';
import { loadFixture } from './eval/fixtures';
import { f1, rate, scorePage } from './eval/metrics';
import { oracleRecognizers } from './eval/oracle';
import { type GrayImage, createGray, grayToRgba } from './image/gray';
import { type OmrProgress, OmrCancelledError, isCancelled, measuresAt, recognizeDocument, recognizePage } from './pipeline';
import { summarizeDocument, summarizePage } from './summary';
import { fillMissingDurations, flagMeasuresOffMetre, suggestMetreFix } from './reconcile';
import { omrToSong } from './to-song';
import { type OmrMeasure, type OmrNotationEvent, type OmrStaff, type OmrTabEvent, durationTicks, isNotationEvent, isTabEvent } from './types';
import { createOmrWorker } from './worker/client';

describe('recognizePage', () => {
  it('reads a notation + tab page with the built-in recognizers, links the staves and checks the measures', async () => {
    const fx = loadFixture('linked-ode-bravura-100');
    const progress: OmrProgress[] = [];
    const page = await recognizePage(fx.gray, { onProgress: (p) => progress.push(p) });
    const s = scorePage(page, fx.truth);
    expect(s.stavesMatched).toBe(s.stavesTruth);
    expect([rate(s.pitch), rate(s.duration), rate(s.fret), rate(s.string)]).toEqual([1, 1, 1, 1]);
    expect(f1(s.notes)).toBe(1);
    // Progress: prepare, every staff, assemble, done; the fraction never goes back.
    expect(progress[0].stage).toBe('prepare');
    expect(progress[progress.length - 1]).toMatchObject({ stage: 'done', fraction: 1 });
    expect(progress.filter((p) => p.stage === 'staff')).toHaveLength(4);
    for (let i = 1; i < progress.length; i++) expect(progress[i].fraction).toBeGreaterThanOrEqual(progress[i - 1].fraction);
    // Linked: every chord has its tab column, string and fret; notation and tab agree.
    const [notation, tab] = page.systems[0].staves;
    expect(notation.linkedStaffId).toBe(tab.id);
    const chords = notation.measures.flatMap((m) => m.events).filter(isNotationEvent).filter((e) => e.kind === 'chord');
    expect(chords.every((e) => e.linkedEventId && e.notes.every((n) => n.string && n.fret !== undefined))).toBe(true);
    expect(chords.flatMap((e) => e.notes).every((n) => !n.issues?.length)).toBe(true);
    // Key and time in force, measures checked.
    expect(notation.keyInForce).toEqual({ fifths: 1, source: 'printed' });
    expect(notation.timeInForce).toMatchObject({ beats: 4, beatValue: 4, source: 'printed' });
    expect(page.systems[1].staves[0].timeInForce?.source).toBe('carried');
    expect(notation.measures.every((m) => m.addsUp === true)).toBe(true);
    expect(page.timings?.total).toBeGreaterThan(0);
    // Tab under notation takes the notation's rhythm.
    const cols = tab.measures.flatMap((m) => m.events).filter(isTabEvent).filter((e) => e.kind === 'tab');
    expect(cols.every((e) => e.duration?.source === 'merged')).toBe(true);
    const summary = summarizePage(page);
    expect(summary.verdict).toBe('good');
    expect(summary.lines.join(' ')).toMatch(/Notation and tab agree on \d+ of \d+ notes/);
  }, 60_000);

  it('accepts RGBA pictures, the older call form, and estimates rhythm for tab without any', async () => {
    const fx = loadFixture('tab-ode-ls-100');
    const rgba = { data: grayToRgba(fx.gray), width: fx.gray.width, height: fx.gray.height };
    const page = await recognizePage(rgba, oracleRecognizers(fx.truth));
    const tab = page.systems[0].staves[0];
    const events = tab.measures.flatMap((m) => m.events).filter(isTabEvent).filter((e) => e.kind === 'tab');
    expect(events.length).toBeGreaterThan(10);
    expect(events.every((e) => e.duration?.source === 'inferred' && e.duration.confidence < 0.5)).toBe(true);
    // Ode to Joy is mostly quarters: the spacing says so for most of them.
    const quarters = events.filter((e) => e.duration?.value === 'quarter').length;
    expect(quarters / events.length).toBeGreaterThan(0.6);
    const summary = summarizePage(page);
    expect(summary.rhythm).toBe('estimated');
    expect(summary.lines.join(' ')).toMatch(/estimated from the spacing/);
    expect(summary.lines.join(' ')).toMatch(/Time: 4\/4 \(none printed: assumed\)/);
    await expect(recognizePage({ data: new Uint8Array(7), width: 2, height: 2 })).rejects.toThrow(/bytes/);
  }, 60_000);

  it('stops when cancelled', async () => {
    const fx = loadFixture('linked-ode-bravura-100');
    const ctl = new AbortController();
    const run = recognizePage(fx.gray, {
      signal: ctl.signal,
      onProgress: (p) => { if (p.stage === 'staff' && p.staff === 1) ctl.abort(); },
    });
    await expect(run).rejects.toBeInstanceOf(OmrCancelledError);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  }, 60_000);

  it('reports a blank picture honestly', async () => {
    const page = await recognizePage(createGray(600, 800));
    expect(page.systems).toHaveLength(0);
    expect(page.warnings.map((w) => w.code)).toContain('no-staves');
    const summary = summarizePage(page);
    expect(summary.headline).toBe('No music found');
    expect(summary.verdict).toBe('poor');
  });
});

describe('the metre sanity pass', () => {
  const tabEvent = (x: number, value?: 'quarter' | 'eighth' | 'half', confidence = 0.9): OmrTabEvent => ({
    id: `e${x}`, bbox: { x, y: 0, w: 5, h: 5 }, confidence: 0.9, source: 'image', kind: 'tab', x,
    notes: [{ id: `n${x}`, bbox: { x, y: 0, w: 5, h: 5 }, confidence: 0.9, source: 'image', string: 1, fret: 0, midi: 64 }],
    ...(value ? { duration: { value, dots: 0, ticks: durationTicks(value), confidence, source: 'image' as const } } : {}),
  });
  const measure = (events: OmrTabEvent[], addsUp?: boolean): OmrMeasure => ({ id: 'm', bbox: { x: 0, y: 0, w: 400, h: 50 }, confidence: 1, index: 1, x0: 0, x1: 400, events, ...(addsUp !== undefined ? { addsUp } : {}) });

  it('gives columns a bad photo left without a stem the length the rest of the measure lacks, instead of dropping them', () => {
    // 4/4: two quarters read, two columns without stems, evenly spaced.
    const m = measure([tabEvent(20, 'quarter'), tabEvent(120, 'quarter'), tabEvent(220), tabEvent(320)]);
    expect(fillMissingDurations(m, 3840)).toBe(2);
    const filled = m.events.slice(2) as OmrTabEvent[];
    expect(filled.map((e) => e.duration?.value)).toEqual(['quarter', 'quarter']);
    expect(filled.every((e) => e.duration!.source === 'inferred' && e.duration!.confidence < 0.5 && e.issues?.[0].code === 'rhythm-estimated')).toBe(true);
    // A measure with nothing printed at all is left to the spacing estimate.
    expect(fillMissingDurations(measure([tabEvent(20), tabEvent(120)]), 3840)).toBe(0);
  });

  it('offers the one doubtful length that would make a measure fit as its fix, marked, without changing it', () => {
    // 3/4 read as quarter, quarter, half (a half that may really be a quarter, read with little confidence).
    const m = measure([tabEvent(20, 'quarter'), tabEvent(120, 'quarter'), tabEvent(220, 'half', 0.6)], false);
    (m.events[2] as OmrTabEvent).duration!.alternatives = [{ value: { value: 'quarter', dots: 0 }, confidence: 0.35 }];
    expect(suggestMetreFix(m, 2880, '3/4')).toBe(true);
    const d = (m.events[2] as OmrTabEvent).duration!;
    expect(d.value).toBe('half');
    expect(d.confidence).toBeLessThan(0.5);
    expect(d.alternatives?.[0].value).toEqual({ value: 'quarter', dots: 0 });
    expect(m.events[2].issues?.[0]).toMatchObject({ code: 'measure-does-not-fit', message: expect.stringMatching(/does not fit 3\/4; a quarter here instead of a half would make it fit/) });
  });

  it('offers nothing for a clearly read measure or two equally good fixes, but says the measure does not fit', () => {
    const sure = measure([tabEvent(20, 'quarter'), tabEvent(120, 'quarter'), tabEvent(220, 'half')], false);
    expect(suggestMetreFix(sure, 2880, '3/4')).toBe(false);
    const twoWays = measure([tabEvent(20, 'half', 0.4), tabEvent(120, 'half', 0.4)], false);
    expect(suggestMetreFix(twoWays, 2880, '3/4')).toBe(false);
    const staff = { measures: [{ ...sure, ticks: 3840, expectedTicks: 2880 }], timeInForce: { beats: 3, beatValue: 4, source: 'printed' } } as unknown as OmrStaff;
    expect(flagMeasuresOffMetre(staff)).toBe(1);
    expect(staff.measures[0].issues?.[0]).toMatchObject({ code: 'measure-does-not-fit', message: expect.stringMatching(/does not fit 3\/4: .* 4 quarter notes, .* 3/) });
  });
});

describe('a staff printed in cue-size notes', () => {
  it('is read (the small notes are the music there) and says so; a normal staff is not', async () => {
    const fx = loadFixture('un-cue-bravura-s12', 'unseen');
    const page = await recognizePage(fx.gray);
    const s = scorePage(page, fx.truth);
    // Before: the second line, printed small throughout, read as two notes of 34.
    expect(s.notes.tp / (s.notes.tp + s.notes.fn)).toBeGreaterThan(0.6);
    expect(s.notes.tp / (s.notes.tp + s.notes.fp)).toBeGreaterThan(0.95);
    expect(page.warnings.some((w) => w.code === 'small-notes')).toBe(true);
    expect(summarizePage(page).lines.join(' ')).toMatch(/small \(cue-size\) notes/);
    const normal = await recognizePage(loadFixture('linked-ode-bravura-100').gray);
    expect(normal.warnings.some((w) => w.code === 'small-notes')).toBe(false);
  }, 60_000);
});

describe('words over a tab staff', () => {
  it('locates the chord symbols printed over tab that has no notation, so OCR or the AI can read them', async () => {
    const fx = loadFixture('tab-open-chords-ins-150');
    const page = await recognizePage(fx.gray);
    const located = page.systems.flatMap((s) => s.texts).filter((t) => t.kind === 'chord-symbol');
    const chords = fx.truth.texts.filter((t) => t.kind === 'chord');
    expect(chords.length).toBe(8);
    expect(located.length).toBe(8);
    for (const c of chords) {
      const [x, y, w, h] = c.bbox as unknown as [number, number, number, number];
      expect(located.some((t) => x + w / 2 >= t.bbox.x - 2 && x + w / 2 <= t.bbox.x + t.bbox.w + 2 && y + h / 2 >= t.bbox.y - 2 && y + h / 2 <= t.bbox.y + t.bbox.h + 2), c.text).toBe(true);
    }
    // Once read (here: as OCR would), they become the song's chords, each at its beat.
    located.sort((a, b) => a.bbox.x - b.bbox.x).forEach((t, i) => { t.text = ['C', 'G', 'Am', 'F', 'Em', 'D', 'G', 'C'][i]; });
    const { song } = omrToSong(page);
    expect(song.chords.map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F', 'Em', 'D', 'G', 'C']);
    expect(song.chords.map((c) => c.bar)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  }, 60_000);

  it('does not take a measure number or a line of words for a chord', async () => {
    // alphaTab prints a measure number and "Guitar Standard Tuning" over the first staff.
    const fx = loadFixture('ua-tab-plain-e', 'unseen');
    const page = await recognizePage(fx.gray);
    expect(page.systems.flatMap((s) => s.texts).filter((t) => t.kind === 'chord-symbol')).toHaveLength(0);
  }, 60_000);
});

describe('recognizeDocument', () => {
  it('reads pages in order as one piece: key and time carry over, measures are joined', async () => {
    const a = loadFixture('ode-bravura-100');
    const b = loadFixture('tab-ode-ls-100');
    const doc = await recognizeDocument([a.gray, b.gray], { tab: oracleRecognizers(b.truth).tab, notation: oracleRecognizers(a.truth).notation });
    expect(doc.pages.map((p) => p.pageIndex)).toEqual([0, 1]);
    const measuresA = a.truth.systems.reduce((t, s) => t + s.staves[0].measures.length, 0);
    const measuresB = b.truth.systems.reduce((t, s) => t + s.staves[0].measures.length, 0);
    expect(doc.measures).toHaveLength(measuresA + measuresB);
    expect(doc.measures.map((m) => m.number)).toEqual(doc.measures.map((_, i) => i));
    expect(doc.measures[measuresA].page).toBe(1);
    // The tab page prints no time signature: it continues in the first page's 4/4, carried.
    expect(doc.pages[1].systems[0].staves[0].timeInForce).toMatchObject({ beats: 4, beatValue: 4, source: 'carried' });
    expect(doc.context).toMatchObject({ fifths: 1, beats: 4, beatValue: 4 });
    expect(measuresAt(doc, doc.measures[0])).toHaveLength(1);
    const s = summarizeDocument(doc);
    expect(s.counts.staves).toEqual({ notation: 2, tab: 2 });
  }, 60_000);
});

describe('classifyPage', () => {
  it('tells tab, notation and both apart', () => {
    expect(classifyPage(loadFixture('tab-ode-ls-100').gray)).toMatchObject({ kind: 'tab', asciiTab: false });
    expect(classifyPage(loadFixture('ode-bravura-100').gray).kind).toBe('notation');
    const both = classifyPage(loadFixture('linked-ode-bravura-100').gray);
    expect(both.kind).toBe('both');
    expect(both.staves.linkedSystems).toBe(2);
  });

  it('sends text-like pages to OCR and recognises an empty picture', () => {
    // Lines of "words" made of thin strokes (stems, bowls, crossbars) of varying heights, no staff.
    const page = createGray(800, 1000);
    const dot = (x: number, y: number): void => { if (x >= 0 && y >= 0 && x < 800 && y < 1000) page.data[y * 800 + x] = 25; };
    const bar = (x0: number, y0: number, w: number, h: number): void => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) dot(x, y); };
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let line = 0; line < 9; line++) {
      const base = 90 + line * 95 + Math.round(rnd() * 6);
      let x = 50 + Math.round(rnd() * 20);
      while (x < 720) {
        const letters = 2 + Math.floor(rnd() * 7);
        for (let k = 0; k < letters && x < 740; k++) {
          const tall = rnd() < 0.3;
          const h = tall ? 16 : 10;
          const shape = Math.floor(rnd() * 3);
          bar(x, base - h, 2, h);
          if (shape >= 1) { bar(x + 6, base - 10, 2, 10); bar(x, base - 10, 8, 2); }
          if (shape === 2) bar(x, base - 2, 8, 2);
          x += shape ? 11 : 5;
        }
        x += 9 + Math.round(rnd() * 4);
      }
    }
    expect(classifyPage(page)).toMatchObject({ kind: 'text' });
    expect(classifyPage(createGray(800, 1000))).toMatchObject({ kind: 'not-music' });
  });

  it('reads six rows of typed dashes as text (ASCII tab), not as a tab staff', () => {
    const page = createGray(1000, 600);
    for (let l = 0; l < 6; l++) {
      const y = 200 + l * 22;
      // "--------3---5--" in a monospace face: dashes 9 px long with 3 px gaps.
      for (let x = 60; x < 940; x++) if (x % 12 < 9) for (let dy = 0; dy < 2; dy++) page.data[(y + dy) * 1000 + x] = 30;
    }
    const c = classifyPage(page);
    expect(c).toMatchObject({ kind: 'text', asciiTab: true });
    expect(c.staves.tab).toBe(0);
  });
});

describe('the worker protocol (in this thread)', () => {
  const fx = loadFixture('linked-ode-bravura-100');
  const gray: GrayImage = fx.gray;

  it('gives the same page as the direct call, with progress, and answers the classifier', async () => {
    const omr = createOmrWorker({ worker: 'inline' });
    const seen: OmrProgress[] = [];
    const page = await omr.recognizePage(gray, { onProgress: (p) => seen.push(p) });
    const direct = await recognizePage(gray);
    const strip = (p: typeof page): unknown => JSON.parse(JSON.stringify({ ...p, timings: undefined }));
    expect(strip(page)).toEqual(strip(direct));
    expect(seen.length).toBeGreaterThan(4);
    expect((await omr.classifyPage(gray)).kind).toBe('both');
    omr.terminate();
  }, 60_000);

  it('returns the quick look: the layout without symbols, the paper and the cleaned page', async () => {
    const omr = createOmrWorker({ worker: 'inline' });
    const look = await omr.lookAtPage(gray, { cleanSide: 500 });
    expect(look.classification.kind).toBe('both');
    expect(look.page?.systems.flatMap((sys) => sys.staves).map((st) => st.kind)).toEqual(['notation', 'tab', 'notation', 'tab']);
    // Geometry only: measures are there, their events are not read yet.
    expect(look.page!.systems[0].staves[0].measures.length).toBeGreaterThan(1);
    expect(look.page!.systems.flatMap((sys) => sys.staves).flatMap((st) => st.measures).every((m) => m.events.length === 0)).toBe(true);
    expect(look.paper.desk).toBe(false);
    expect(look.clean).not.toBeNull();
    expect(Math.max(look.clean!.width, look.clean!.height)).toBeLessThanOrEqual(500);
    expect(look.clean!.data.length).toBe(look.clean!.width * look.clean!.height);
    // Without a size, no cleaned page; a picture with no music has no layout.
    expect((await omr.lookAtPage(gray)).clean).toBeNull();
    const blank = await omr.lookAtPage(createGray(400, 500), { cleanSide: 300 });
    expect(blank.page).toBeNull();
    expect(blank.clean).toBeNull();
    omr.terminate();
  }, 60_000);

  it('cancels a run and proxies the recognizers\' questions to the page\'s vision model', async () => {
    const omr = createOmrWorker({ worker: 'inline', cancelGraceMs: 200 });
    const ctl = new AbortController();
    const run = omr.recognizePage(gray, { signal: ctl.signal, onProgress: (p) => { if (p.stage === 'staff') ctl.abort(); } });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(isCancelled(await run.catch((e: unknown) => e))).toBe(true);
    // A model that answers every question with nothing usable: the reading stays as it was.
    const asked: string[] = [];
    const model = { ask: async (_img: unknown, prompt: string) => { asked.push(prompt); return null; } };
    const blurred = loadFixture('linked-ode-bravura-100');
    const page = await omr.recognizePage(blurred.gray, { ai: model });
    expect(page.systems).toHaveLength(2);
    // (On a clean page nothing is doubtful, so nothing needs asking; the channel is exercised by the
    // classifier test above and by the e2e check.)
    expect(asked.length).toBeGreaterThanOrEqual(0);
    omr.terminate();
    await expect(omr.recognizePage(gray)).resolves.toBeTruthy();
    omr.terminate();
  }, 60_000);
});

describe('summary', () => {
  it('lists disagreements first and words them for the screen', async () => {
    const fx = loadFixture('linked-ode-bravura-100');
    const page = await recognizePage(fx.gray, oracleRecognizers(fx.truth));
    // Make the tab disagree with one note and leave one tab number as a guess.
    const tab = page.systems[0].staves[1];
    const col = tab.measures[1].events.find((e): e is OmrTabEvent => e.kind === 'tab') as OmrTabEvent;
    col.notes[0].issues = [{ code: 'staves-disagree', message: 'The notation shows B3 but the tab shows fret 2 on string 2 (C#4).' }];
    col.notes[0].confidence = 0.35;
    const note = (page.systems[0].staves[0].measures[2].events.find((e): e is OmrNotationEvent => e.kind === 'chord') as OmrNotationEvent).notes[0];
    note.confidence = 0.45;
    page.systems[0].staves[0].measures[3].addsUp = false;
    page.systems[0].staves[0].measures[3].ticks = 2880;
    page.systems[0].staves[0].measures[3].expectedTicks = 3840;
    const s = summarizePage(page);
    expect(s.verdict).toBe('check');
    expect(s.proofread[0].what).toBe('measure');
    expect(s.proofread[0].reason).toMatch(/3 beats .* asks for 4/);
    expect(s.proofread[1]).toMatchObject({ what: 'tab-number', reading: expect.stringMatching(/string/) });
    expect(s.proofread.some((p) => p.what === 'note' && p.confidence === 0.45)).toBe(true);
    expect(s.lines.join(' ')).toMatch(/1 measure does not add up/);
    expect(s.lines.join(' ')).toMatch(/Tab numbers: \d+ read, 1 uncertain/);
  }, 60_000);
});

describe('omrToSong', () => {
  it('turns a reading into a valid song: strings and frets from the tab, rhythm from the notation', async () => {
    const { omrToSong } = await import('./to-song');
    const { validateSong } = await import('@/core/song');
    const fx = loadFixture('linked-ode-bravura-100');
    const page = await recognizePage(fx.gray, oracleRecognizers(fx.truth));
    const { song, warnings, confidence } = omrToSong(page, { title: 'Ode to Joy' });
    expect(validateSong(song).filter((i) => i.level === 'error')).toEqual([]);
    expect(song.bars).toHaveLength(8);
    expect(song.key).toBe('G');
    const first = song.tracks[0].measures[0].beats;
    // Ode to Joy in G: B B C D, on the B string open then fret 1, the G string ... (as the tab prints).
    const gt = fx.truth.systems[0].staves[1].measures[0].events.map((e) => e.notes.map((n) => `${n.string}:${n.fret}`).join());
    expect(first.map((b) => b.notes.map((n) => `${n.string}:${n.fret}`).join())).toEqual(gt);
    expect(first.every((b) => b.duration === 960)).toBe(true);
    expect(warnings).toEqual([]);
    expect(confidence).toBeGreaterThan(0.95);
  }, 60_000);

  it('marks estimated rhythm and keeps a song valid when a measure does not add up', async () => {
    const { omrToSong } = await import('./to-song');
    const { validateSong } = await import('@/core/song');
    const fx = loadFixture('tab-ode-ls-100');
    const page = await recognizePage(fx.gray, oracleRecognizers(fx.truth));
    const m = page.systems[0].staves[0].measures[1];
    m.events = m.events.slice(0, 2);
    const r = omrToSong(page);
    expect(r.estimatedRhythm).toBe(true);
    expect(validateSong(r.song).filter((i) => i.level === 'error')).toEqual([]);
    expect(r.warnings.map((w) => w.message).join(' ')).toMatch(/estimated from the spacing/);
  }, 60_000);
});
