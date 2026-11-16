/**
 * The notation sheet, the glossary, search and the text export.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSixTab } from '@/core/song';
import { GLOSSARY } from '@/lessons';
import { filterGlossary, glossaryEntries, TERM_LESSONS, TERM_SEE_ALSO } from './glossary';
import { intervalById } from './intervals';
import { ARTICULATIONS, DYNAMICS, REPEAT_SIGNS, TAB_TECHNIQUES, beatsWords, lengthExamples, notationItemIds, noteValueRows, timeSignatureRows } from './notation';
import { buildSearchIndex, normalizeQuery, searchReference } from './search';
import { SECTIONS } from './sections';
import { sectionFileName, sectionText } from './text';

describe('notation sheet', () => {
  it('gives note values their length from the rhythm engine', () => {
    expect(noteValueRows().map((v) => `${v.name}=${v.beats} (${v.british}), ${v.perBar} per bar`)).toEqual([
      'whole note=4 (semibreve), 1 per bar',
      'half note=2 (minim), 2 per bar',
      'quarter note=1 (crotchet), 4 per bar',
      'eighth note=0.5 (quaver), 8 per bar',
      'sixteenth note=0.25 (semiquaver), 16 per bar',
    ]);
  });

  it('works out dots, ties and triplets', () => {
    const byId = Object.fromEntries(lengthExamples().map((e) => [e.id, e.beats]));
    expect(byId).toEqual({ 'dotted-half': 3, 'dotted-quarter': 1.5, 'dotted-eighth': 0.75, tie: 3, triplet: 1 });
    expect(beatsWords(1.5)).toBe('1½ beats');
    expect(beatsWords(0.75)).toBe('¾ beat');
    expect(beatsWords(1)).toBe('1 beat');
  });

  it('explains time signatures (hand-written truth)', () => {
    const t = Object.fromEntries(timeSignatureRows().map((r) => [r.text, `${r.kind} ${r.beats}`]));
    expect(t).toMatchObject({ '4/4': 'simple 4', C: 'simple 4', '3/4': 'simple 3', '¢': 'simple 2', '6/8': 'compound 2', '12/8': 'compound 4', '7/8': 'odd 3' });
    expect(timeSignatureRows().find((r) => r.text === '6/8')!.meaning).toBe('2 beats in a bar, each a dotted quarter (three eighth notes).');
  });

  it('has a tab example for every technique that parses into one full bar of 4/4', () => {
    expect(TAB_TECHNIQUES.length).toBeGreaterThanOrEqual(20);
    for (const t of TAB_TECHNIQUES) {
      const r = parseSixTab(`title: ${t.name}\ntempo: ${t.tempo}\ntime: 4/4\n\n${t.tab}\n`);
      expect(r.errors, t.id).toEqual([]);
      expect(r.song!.tracks[0].measures).toHaveLength(1);
    }
  });

  it('each tab example really uses its technique', () => {
    const notes = (id: string) => {
      const t = TAB_TECHNIQUES.find((x) => x.id === id)!;
      return parseSixTab(`title: x\ntempo: 80\n\n${t.tab}\n`).song!.tracks[0].measures[0].beats.flatMap((b) => b.notes);
    };
    expect(notes('hammer-on').some((n) => n.legato === 'hammer')).toBe(true);
    expect(notes('pull-off').some((n) => n.legato === 'pull')).toBe(true);
    expect(notes('slide').some((n) => n.slide === 'up') && notes('slide').some((n) => n.slide === 'down')).toBe(true);
    expect(notes('bend').find((n) => n.bend)?.bend?.amount).toBe(2);
    expect(notes('half-bend').find((n) => n.bend)?.bend?.amount).toBe(1);
    expect(notes('bend-release').find((n) => n.bend)?.bend?.release).toBe(true);
    expect(notes('pre-bend').find((n) => n.bend)?.bend?.pre).toBe(true);
    expect(notes('vibrato')[0].vibrato).toBe(true);
    expect(notes('palm-mute').filter((n) => n.palmMute)).toHaveLength(5);
    expect(notes('dead-note').some((n) => n.dead)).toBe(true);
    expect(notes('ghost-note').some((n) => n.ghost)).toBe(true);
    expect(notes('natural-harmonic').every((n) => n.harmonic === 'natural')).toBe(true);
    expect(notes('artificial-harmonic')[0].harmonic).toBe('artificial');
    expect(notes('tapping').some((n) => n.tap)).toBe(true);
    expect(notes('tab-tie')[1].tie).toBe(true);
    // A full bend on string 3 fret 7 reaches the pitch of fret 9, which the example plays next.
    const bend = notes('bend');
    expect(bend[0].midi + 2).toBe(bend[1].midi);
  });

  it('has unique, route-safe item ids', () => {
    const ids = notationItemIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect([...REPEAT_SIGNS, ...DYNAMICS, ...ARTICULATIONS].every((s) => s.meaning.length > 0)).toBe(true);
  });
});

describe('glossary', () => {
  const entries = glossaryEntries();

  it('has every lesson-glossary term, alphabetically', () => {
    expect(entries.map((e) => e.id).sort()).toEqual(GLOSSARY.map((t) => t.id).sort());
    const terms = entries.map((e) => e.term);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });

  it('links every term to a real Theory Path lesson with its real title', () => {
    const plan = JSON.parse(readFileSync(new URL('../../../content/plan/theory-path.json', import.meta.url), 'utf8')) as {
      course: { stages: Array<{ units: Array<{ id: string; lessons: Array<{ id: string; title: string }> }> }> };
    };
    const titles = new Map<string, string>();
    for (const st of plan.course.stages) for (const u of st.units) for (const l of u.lessons) titles.set(l.id, l.title);
    for (const t of GLOSSARY) {
      const link = TERM_LESSONS[t.id];
      expect(link, `${t.id} has no lesson`).toBeTruthy();
      expect(titles.get(link[0]), `${t.id} -> ${link[0]}`).toBe(link[1]);
    }
    const barre = entries.find((e) => e.id === 'barre')!;
    expect(barre.lesson).toEqual({ id: 'caged/the-barre', title: 'The barre replaces the nut', params: ['caged', 'the-barre'] });
  });

  it('points "see also" links at real items', () => {
    expect(intervalById(TERM_SEE_ALSO.tritone.item)?.id).toBe('A4');
    expect(intervalById(TERM_SEE_ALSO['whole-step'].item)?.id).toBe('M2');
    const ids = new Set(notationItemIds());
    for (const s of Object.values(TERM_SEE_ALSO)) if (s.section === 'notation' && s.item) expect(ids.has(s.item), s.item).toBe(true);
    for (const id of Object.keys(TERM_SEE_ALSO)) expect(GLOSSARY.some((t) => t.id === id), id).toBe(true);
  });

  it('filters by term first, then by definition', () => {
    const hits = filterGlossary(entries, 'note');
    expect(hits[0].term.toLowerCase()).toContain('note');
    expect(filterGlossary(entries, 'barre').map((e) => e.id)[0]).toBe('barre');
    expect(filterGlossary(entries, '')).toHaveLength(entries.length);
    expect(filterGlossary(entries, 'zzzz')).toEqual([]);
  });
});

describe('search', () => {
  const index = buildSearchIndex();
  const top = (q: string) => searchReference(index, q, 5).map((h) => h.entry.id);

  it('has unique ids', () => {
    const ids = index.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(index.length).toBeGreaterThan(350);
  });

  it('normalises what learners type', () => {
    expect(normalizeQuery('F♯ Minor')).toBe('f# minor');
    expect(normalizeQuery('b flat major')).toBe('bb major');
    expect(normalizeQuery('  E  flat ')).toBe('eb');
  });

  it('finds things across every section', () => {
    expect(top('G major')[0]).toBe('circle:g-major');
    expect(top('f sharp minor')[0]).toBe('circle:f-sharp-minor');
    expect(top('tritone')).toEqual(expect.arrayContaining(['glossary:tritone', 'intervals:aug4']));
    expect(top('M3')[0]).toBe('intervals:maj3');
    expect(top('m3')[0]).toBe('intervals:m3');
    expect(top('maj7')[0]).toBe('chords:maj7');
    expect(top('dorian')[0]).toBe('scales:dorian');
    expect(top('drop d')[0]).toBe('tunings:drop-d');
    expect(top('hammer')[0]).toBe('notation:hammer-on');
    expect(top('staccato')).toContain('notation:staccato');
    expect(top('barre')[0]).toBe('glossary:barre');
    expect(top('3 flats')[0]).toBe('keys:eb-major');
    expect(top('chords in D')[0]).toBe('harmony:d-major');
    expect(top('father charles')[0]).toBe('keys:order');
    expect(searchReference(index, '   ')).toEqual([]);
    expect(searchReference(index, 'qqqqzz')).toEqual([]);
  });

  it('builds titles with the given formatters but still finds ASCII', () => {
    const solfege = buildSearchIndex({ note: (n) => n.replace(/^G/, 'Sol'), chord: (c) => c, key: (k) => k.replace(/^G/, 'Sol') });
    expect(searchReference(solfege, 'G major')[0].entry.title).toBe('Sol major');
  });
});

describe('text export', () => {
  it('writes every section, with its title and real data', () => {
    for (const s of SECTIONS) {
      const text = sectionText(s.id);
      expect(text.startsWith(s.title.toUpperCase())).toBe(true);
      expect(text.length).toBeGreaterThan(200);
    }
    expect(sectionText('intervals')).toContain('4 | M3 | major third | m6 | C–E');
    expect(sectionText('keys')).toContain('3 sharps | A major | F# minor | F# C# G#');
    expect(sectionText('harmony')).toContain('D major | D | Em | F#m | G | A | Bm | C#dim');
    expect(sectionText('glossary')).toContain('barre: One finger laid flat');
    expect(sectionText('tunings')).toContain('Drop D | D A D G B E | String 6 down a whole step.');
    expect(sectionFileName('glossary')).toBe('sixstring-reference-glossary.txt');
  });
});
