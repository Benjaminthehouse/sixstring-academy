import { describe, expect, it } from 'vitest';
import {
  type AiMeasure, type OmrAiClient, type OmrAiRequest, OMR_SYSTEM_PROMPT, cropForAi, fuseAiReading, fuseMeasure, measureQuestionPrompt, measuresToCheck,
  pageReadingPrompt, parseAiMeasure, parseAiReading, parsePitchName, readPageWithAi, secondOpinionOnMeasure,
} from './ai-assist';
import { createGray } from './image/gray';
import { checkMeasures } from './reconcile';
import {
  type BBox, type DurationValue, type OmrDuration, type OmrMeasure, type OmrNotationEvent, type OmrNote, type OmrPage, type OmrStaff, type OmrTabEvent,
  type OmrTabNote, durationTicks, midiAtFret, pitchAtStaffPosition,
} from './types';

// ---- small synthetic pages ------------------------------------------------------------------

const box = (x: number, y = 0): BBox => ({ x: x - 5, y, w: 10, h: 10 });
const dur = (value: DurationValue, confidence = 0.9): OmrDuration => ({ value, dots: 0, ticks: durationTicks(value), confidence, source: 'image' });
const head = (pos: number, confidence = 0.9, alts?: number[]): OmrNote => ({
  id: `h${pos}`, bbox: box(0), confidence, staffPosition: pos, head: 'filled', pitch: pitchAtStaffPosition(pos),
  alternatives: alts?.map((a) => ({ value: pitchAtStaffPosition(a), confidence: 0.3 })),
});
const chord = (x: number, notes: OmrNote[], d = dur('quarter')): OmrNotationEvent => ({ id: `n${x}`, kind: 'chord', x, bbox: box(x), confidence: 0.9, notes, duration: d });
const tabNote = (string: number, fret: number, confidence = 0.95, alts?: number[]): OmrTabNote => ({
  id: `t${string}.${fret}`, bbox: box(0, 100), confidence, string, fret, midi: midiAtFret(string, fret), alternatives: alts?.map((a) => ({ value: a, confidence: 0.3 })),
});
const column = (x: number, notes: OmrTabNote[], d?: OmrDuration): OmrTabEvent => ({ id: `c${x}`, kind: 'tab', x, bbox: box(x, 100), confidence: 0.9, notes, duration: d });
const measure = (id: string, index: number, x0: number, x1: number, events: OmrMeasure['events']): OmrMeasure => ({ id, bbox: { x: x0, y: 0, w: x1 - x0, h: 40 }, confidence: 1, index, x0, x1, events });

function staff(id: string, kind: 'notation' | 'tab', measures: OmrMeasure[], y = 0): OmrStaff {
  const n = kind === 'tab' ? 6 : 5;
  const lines = Array.from({ length: n }, (_, l) => [{ x: 0, y: y + 10 * l }, { x: 400, y: y + 10 * l }]);
  return {
    id, bbox: box(0), confidence: 1, kind, lineCount: n,
    geometry: { lines, space: 10, lineThickness: 1, x0: 0, x1: 400, bbox: { x: 0, y, w: 400, h: 10 * (n - 1) }, contentBox: { x: 0, y: y - 30, w: 400, h: 10 * (n - 1) + 60 } },
    barlines: [], measures, timeInForce: { beats: 4, beatValue: 4, source: 'printed' }, keyInForce: kind === 'notation' ? { fifths: 0, source: 'printed' } : undefined,
  };
}

function pageOf(staves: OmrStaff[]): OmrPage {
  return {
    width: 400, height: 300, staffSpace: 10, texts: [], warnings: [],
    quality: { source: 'render', skewDegrees: 0, correction: 'none', sourceStaffSpace: 10, noise: 0, contrast: 1, score: 1 },
    systems: [{ id: 's0', bbox: { x: 0, y: 0, w: 400, h: 200 }, confidence: 1, index: 0, staves, texts: [] }],
  };
}

/** A fake model that answers from a script and records what it was asked. */
function fakeClient(answers: unknown[], maxImages = 1): OmrAiClient & { asked: OmrAiRequest<unknown>[] } {
  const asked: OmrAiRequest<unknown>[] = [];
  return {
    asked,
    maxImages,
    async askJson<T>(req: OmrAiRequest<T>): Promise<T> {
      asked.push(req as OmrAiRequest<unknown>);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      // Like the platform: validate, and on failure retry once with the next scripted answer.
      try {
        return req.validate(a);
      } catch {
        return req.validate(answers.shift());
      }
    },
  };
}

const ev = (pitch: string | null, string: number | null, fret: number | null, duration = 'quarter', extra: Record<string, unknown> = {}) => ({ rest: false, duration, dots: 0, triplet: false, notes: [{ pitch, string, fret, tie: false }], uncertain: false, ...extra });

// ---- tests ------------------------------------------------------------------------------------

describe('the prompts', () => {
  it('state the guitar conventions and the JSON shape, and forbid inventing notes', () => {
    expect(OMR_SYSTEM_PROMPT).toMatch(/TOP line is string 1/);
    expect(OMR_SYSTEM_PROMPT).toMatch(/octave lower than written/);
    expect(OMR_SYSTEM_PROMPT).toMatch(/Never invent notes/);
    const p = pageReadingPrompt({ tiles: 3, staves: ['notation', 'tab'], time: { beats: 3, beatValue: 4 } });
    expect(p).toMatch(/3 pictures/);
    expect(p).toMatch(/notation \+ tab/);
    expect(p).toMatch(/3\/4/);
    expect(p).toMatch(/"systems"/);
    expect(measureQuestionPrompt({ staves: ['tab'], time: null, fifths: null, found: 'string 1 fret 3 quarter' })).toMatch(/ONE measure/);
  });
});

describe('validating and repairing an answer', () => {
  it('parses pitches in the usual spellings', () => {
    expect(parsePitchName('F#4')).toMatchObject({ step: 'F', alter: 1, octave: 4, midi: 66 });
    expect(parsePitchName('B♭3')).toMatchObject({ step: 'B', alter: -1, midi: 58 });
    expect(parsePitchName('c5')).toMatchObject({ step: 'C', midi: 72 });
    expect(parsePitchName('H4')).toBeNull();
    expect(parsePitchName(12)).toBeNull();
  });

  it('keeps what is usable, drops what is not, and lists every repair', () => {
    const r = parseAiReading({
      title: '  Air  ', tempo: 'Andante',
      systems: [{
        key: { fifths: 1 }, time: { beats: 3, beatValue: 4 },
        measures: [
          { chords: ['G', { symbol: 'D7' }], events: [
            ev('G4', 3, 0),
            ev(null, 1, 31),                                   // fret out of range: dropped (event has nothing left)
            { rest: false, duration: 'crotchet', notes: [{ pitch: 'A4', string: 3, fret: 2 }, { pitch: 'B4', string: 3, fret: 4 }] },   // second note on string 3 dropped
            ev('G4', 2, 0),                                    // pitch and fret disagree: inconsistent
            'nonsense',
          ] },
        ],
      }, { key: 12, measures: 'no' }],
    });
    expect(r.title).toBe('Air');
    expect(r.systems[0].fifths).toBe(1);
    expect(r.systems[0].time).toEqual({ beats: 3, beatValue: 4 });
    expect(r.systems[1].fifths).toBeNull();
    const m = r.systems[0].measures[0];
    expect(m.chords).toEqual(['G', 'D7']);
    expect(m.events).toHaveLength(3);
    expect(m.events[0].notes[0]).toMatchObject({ string: 3, fret: 0, written: { midi: 67 } });
    expect(m.events[1].notes).toHaveLength(1);
    expect(m.events[1].duration?.value).toBe('quarter');
    expect(m.events[2].inconsistent).toBe(true);
    expect(r.repairs.join(' ')).toMatch(/fret 31 dropped/);
    expect(r.repairs.join(' ')).toMatch(/second note on string 3/);
    expect(r.repairs.join(' ')).toMatch(/not an object/);
  });

  it('refuses answers that are unusable as a whole (so the platform asks once more)', () => {
    expect(() => parseAiReading(null)).toThrow(/JSON object/);
    expect(() => parseAiReading({ systems: 'x' })).toThrow(/systems/);
    expect(() => parseAiReading({ systems: [{ measures: [{ events: [] }] }] })).toThrow(/No measure/);
    expect(() => parseAiMeasure({ notes: [] })).toThrow(/events/);
    // A bare measures list is accepted as one system.
    expect(parseAiReading({ measures: [{ events: [ev('E4', 1, 0)] }] }).systems).toHaveLength(1);
  });
});

describe('fusing an AI reading with the picture reading', () => {
  it('raises agreement, keeps a confident picture reading against the AI, and takes the AI only where the rules allow', () => {
    // Notation: G4 (sure), B4 (sure), D5 (a guess with C5 as runner-up), and a tab under it.
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 400, [chord(50, [head(2)]), chord(150, [head(4)]), chord(250, [head(6, 0.45, [5])]), chord(350, [head(8)])])]);
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 400, [column(50, [tabNote(3, 0)]), column(150, [tabNote(2, 0)]), column(250, [tabNote(2, 3, 0.4, [1])]), column(350, [tabNote(1, 1)])])], 100);
    n.linkedStaffId = 't';
    t.linkedStaffId = 'n';
    n.measures[0].events.forEach((e, i) => {
      (e as OmrNotationEvent).linkedEventId = t.measures[0].events[i].id;
      (t.measures[0].events[i] as OmrTabEvent).linkedEventId = e.id;
    });
    const ai: AiMeasure = parseAiMeasure({ events: [ev('G4', 3, 0), ev('C5', 2, 0), ev('C5', 2, 1), ev('F5', 1, 1)] });
    const report = { measures: 0, measuresAgree: 0, agree: 0, disagree: 0, resolved: 0, aiOnly: 0, imageOnly: 0, texts: 0, notes: [] };
    fuseMeasure({ notation: n.measures[0], tab: t.measures[0], notationStaff: n, tabStaff: t }, ai, 3840, 0, report);
    const heads = (n.measures[0].events as OmrNotationEvent[]).map((e) => e.notes[0]);
    // 1st: agreement.
    expect(heads[0].confidence).toBeGreaterThan(0.9);
    // 2nd: the picture is sure of B4, the AI says C5: kept, flagged, AI reading offered.
    expect(heads[1].pitch.midi).toBe(59);
    expect(heads[1].issues?.[0].code).toBe('ai-disagree');
    expect(heads[1].alternatives?.[0].value.midi).toBe(60);
    // 3rd: a guess whose runner-up is the AI's reading: taken, marked resolved.
    expect(heads[2].pitch.midi).toBe(60);
    expect(heads[2].issues?.[0].code).toBe('resolved');
    // Tab: fret 3 (a guess) on string 2 against the AI's fret 1 (its runner-up): taken.
    const q = (t.measures[0].events[2] as OmrTabEvent).notes[0];
    expect(q.fret).toBe(1);
    expect(q.midi).toBe(60);
    expect(report.agree).toBeGreaterThanOrEqual(5);
    expect(report.resolved).toBe(2);
    expect(report.disagree).toBe(1);
  });

  it('takes the AI rhythm only where it makes a measure that did not add up add up', () => {
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 400, [chord(50, [head(2)], dur('quarter', 0.5)), chord(150, [head(4)]), chord(250, [head(6)])])]);
    checkMeasures(n, 3840);
    expect(n.measures[0].addsUp).toBe(false);
    const page = pageOf([n]);
    const reading = parseAiReading({ systems: [{ measures: [{ events: [ev('G4', null, null, 'half'), ev('B4', null, null, 'quarter'), ev('D5', null, null, 'quarter')] }] }] });
    // Three quarters in 4/4 do not add up; the AI's half + quarter + quarter does, for the same
    // three events: the one length that differs is taken from it (and marked).
    const report = fuseAiReading(page, reading);
    const evs = n.measures[0].events as OmrNotationEvent[];
    expect(evs.map((e) => e.duration.value)).toEqual(['half', 'quarter', 'quarter']);
    expect(evs[0].issues?.[0].code).toBe('resolved');
    expect(evs[0].duration.alternatives?.[0].value.value).toBe('quarter');
    expect(n.measures[0].addsUp).toBe(true);
    expect(report.resolved).toBe(1);
  });

  it('adds a note only the AI saw as a guess when it fills a measure that is short', () => {
    const t = staff('t', 'tab', [measure('t.m0', 0, 0, 400, [column(50, [tabNote(1, 0)], dur('quarter')), column(150, [tabNote(1, 1)], dur('quarter')), column(250, [tabNote(1, 3)], dur('quarter'))])]);
    checkMeasures(t, 3840);
    const page = pageOf([t]);
    const reading = parseAiReading({ systems: [{ measures: [{ events: [ev(null, 1, 0), ev(null, 1, 1), ev(null, 1, 3), ev(null, 1, 5)] }] }] });
    const report = fuseAiReading(page, reading);
    const evs = t.measures[0].events as OmrTabEvent[];
    expect(evs).toHaveLength(4);
    const added = evs[3];
    expect(added.source).toBe('ai');
    expect(added.confidence).toBeLessThan(0.5);
    expect(added.notes[0]).toMatchObject({ string: 1, fret: 5 });
    expect(added.notes[0].issues?.[0].code).toBe('ai-only');
    expect(added.x).toBeGreaterThan(250);
    expect(report.aiOnly).toBe(1);
    expect(t.measures[0].addsUp).toBe(true);
  });

  it('copes with a different number of measures and fills texts', () => {
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 200, [chord(50, [head(2)], dur('whole'))]), measure('n.m1', 1, 200, 400, [chord(250, [head(4)], dur('whole'))])]);
    const page = pageOf([n]);
    const reading = parseAiReading({
      title: 'Study', tempo: 'Slowly',
      systems: [{ fifths: 0, measures: [{ events: [ev('E4', null, null, 'whole')] }, { chords: ['G'], events: [ev('G4', null, null, 'whole')] }, { events: [ev('B4', null, null, 'whole')] }] }],
    });
    const report = fuseAiReading(page, reading);
    expect(report.notes.join(' ')).toMatch(/2 measures, the AI reading 3/);
    expect(page.texts.map((t) => t.text)).toEqual(['Study', 'Slowly']);
    expect(page.systems[0].texts.some((t) => t.text === 'G' && t.kind === 'chord-symbol')).toBe(true);
    expect(report.agree).toBe(2);
  });
});

describe('asking the model', () => {
  it('reads a page system by system and maps the answers back', async () => {
    const n = staff('n', 'notation', [measure('n.m0', 0, 0, 400, [chord(50, [head(2)], dur('whole'))])], 40);
    const n2 = staff('n2', 'notation', [measure('n2.m0', 0, 0, 400, [chord(50, [head(4)], dur('whole'))])], 160);
    const page = pageOf([n]);
    page.systems.push({ id: 's1', bbox: { x: 0, y: 120, w: 400, h: 100 }, confidence: 1, index: 1, staves: [n2], texts: [] });
    const client = fakeClient([
      { title: 'One', systems: [{ measures: [{ events: [ev('G4', null, null, 'whole')] }] }, { measures: [{ events: [ev('B4', null, null, 'whole')] }] }] },
    ], 2);
    const src = createGray(400, 300);
    const res = await readPageWithAi(src, page, client);
    expect(res.requests).toBe(1);
    expect(client.asked[0].images).toHaveLength(2);
    expect(res.systemMap).toEqual([0, 1]);
    const report = fuseAiReading(page, res.reading, res.systemMap);
    expect(report.agree).toBe(2);
  });

  it('retries once on a bad answer, and lets a model failure through to the caller', async () => {
    const page = pageOf([staff('n', 'notation', [measure('n.m0', 0, 0, 400, [chord(50, [head(2)], dur('whole'))])])]);
    const client = fakeClient(['not json at all', { systems: [{ measures: [{ events: [ev('G4', null, null, 'whole')] }] }] }]);
    const res = await readPageWithAi(createGray(400, 300), page, client);
    expect(res.reading.systems[0].measures[0].events).toHaveLength(1);
    const failing = fakeClient([new Error('network')]);
    await expect(readPageWithAi(createGray(400, 300), page, failing)).rejects.toThrow('network');
  });

  it('sends the whole page when no staff was found', async () => {
    const client = fakeClient([{ systems: [{ measures: [{ events: [ev(null, 2, 3)] }] }] }]);
    const big = createGray(3000, 4000);
    const res = await readPageWithAi(big, null, client);
    expect(res.systemMap).toEqual([-1]);
    const img = client.asked[0].images[0].gray;
    expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(1800);
  });

  it('asks about the most doubtful measure with a focused question and fuses only that measure', async () => {
    const t = staff('t', 'tab', [
      measure('t.m0', 0, 0, 200, [column(50, [tabNote(2, 1)], dur('half')), column(150, [tabNote(2, 3)], dur('half'))]),
      measure('t.m1', 1, 200, 400, [column(250, [tabNote(1, 8, 0.3, [6])], dur('half')), column(350, [tabNote(1, 5)], dur('quarter'))]),
    ]);
    checkMeasures(t, 3840);
    const page = pageOf([t]);
    const todo = measuresToCheck(page, 1);
    expect(todo).toEqual([expect.objectContaining({ staffId: 't', measureIndex: 1 })]);
    const client = fakeClient([{ events: [ev(null, 1, 6, 'half'), ev(null, 1, 5, 'half')] }]);
    const report = await secondOpinionOnMeasure(createGray(400, 300), page, 't', 1, client);
    expect(client.asked[0].prompt).toMatch(/string 1 fret 8 half/);
    const evs = t.measures[1].events as OmrTabEvent[];
    expect(evs[0].notes[0].fret).toBe(6);
    expect(evs[1].duration?.value).toBe('half');
    expect(t.measures[1].addsUp).toBe(true);
    expect(report.resolved).toBe(2);
    // The other measure was not touched.
    expect((t.measures[0].events[0] as OmrTabEvent).notes[0].issues).toBeUndefined();
  });

  it('crops and scales tiles to a readable size', () => {
    const src = createGray(2000, 1000);
    const tile = cropForAi(src, { x: 100, y: 100, w: 1000, h: 100 }, 7);
    expect(tile.width).toBeGreaterThan(1000);
    expect(tile.width).toBeLessThanOrEqual(1800);
  });
});
