/**
 * MusicXML export (score-partwise 4.0, one part per track): notes spelled in the key, written in a
 * treble 8vb clef with the sounding pitch in `<pitch>`, tab in `<technical><string>/<fret>` with
 * the tuning and capo in `<staff-details>`, guitar techniques, chord symbols, lyrics, tempo, key and
 * time changes, repeats and endings, sections as rehearsal marks. Slashes of a rhythm track are
 * written as slash noteheads.
 */
import { getKey, midiToNote, parseChord, parseNote, spellInKey } from '@/core/theory';
import { barLength, trackCapo, trackTuning, valueFromTicks } from './model';
import type { Beat, Note, NoteValue, Song, Track } from './types';
import { PPQ } from './types';
import { leaf, tag } from './xml';

const TYPE_NAME: Record<number, string> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th' };

const KIND_BY_TYPE: Record<string, string> = {
  major: 'major', minor: 'minor', aug: 'augmented', dim: 'diminished', '7': 'dominant', maj7: 'major-seventh', m7: 'minor-seventh',
  dim7: 'diminished-seventh', m7b5: 'half-diminished', mmaj7: 'major-minor', '6': 'major-sixth', m6: 'minor-sixth', '9': 'dominant-ninth',
  maj9: 'major-ninth', m9: 'minor-ninth', '11': 'dominant-11th', m11: 'minor-11th', '13': 'dominant-13th', maj13: 'major-13th', m13: 'minor-13th',
  sus2: 'suspended-second', sus4: 'suspended-fourth', '5': 'power',
};

function pitchXml(midi: number, key: string): string {
  let name: string;
  try {
    name = spellInKey(midi, key);
  } catch {
    name = midiToNote(midi);
  }
  const n = parseNote(name)!;
  return tag('pitch', null, leaf('step', n.letter), n.alt ? leaf('alter', n.alt) : '', leaf('octave', n.octave ?? Math.floor(midi / 12) - 1));
}

function rootXml(prefix: 'root' | 'bass', note: string): string {
  const n = parseNote(note)!;
  return tag(prefix, null, leaf(`${prefix}-step`, n.letter), n.alt ? leaf(`${prefix}-alter`, n.alt) : '');
}

/** A `<harmony>` element for a chord symbol. */
function harmonyXml(symbol: string, offset: number): string {
  if (/^n\.?c\.?$/i.test(symbol)) return tag('harmony', null, tag('root', null, leaf('root-step', 'C')), leaf('kind', 'none'));
  const c = parseChord(symbol);
  if (!c) return '';
  const kind = KIND_BY_TYPE[c.type.id];
  const suffix = c.symbol.slice(c.root.length).replace(/\/.*$/, '');
  return tag(
    'harmony', null,
    rootXml('root', c.root),
    kind ? leaf('kind', kind, { text: suffix }) : leaf('kind', 'other', { text: suffix }),
    c.bass ? rootXml('bass', c.bass) : '',
    offset ? leaf('offset', offset) : '',
  );
}

function valueOf(beat: Beat): NoteValue | null {
  return beat.value ?? valueFromTicks(beat.duration);
}

function typeXml(value: NoteValue | null): string {
  if (!value) return '';
  return [
    TYPE_NAME[value.base] ? leaf('type', TYPE_NAME[value.base]) : '',
    ...Array.from({ length: value.dots ?? 0 }, () => tag('dot', null)),
    value.tuplet ? tag('time-modification', null, leaf('actual-notes', value.tuplet.actual), leaf('normal-notes', value.tuplet.normal)) : '',
  ].join('');
}

/** Write a song as MusicXML text. */
export function toMusicXml(song: Song): string {
  const meta = song.meta;
  const partList = song.tracks.map((t, i) => tag('score-part', { id: `P${i + 1}` }, leaf('part-name', t.name))).join('');
  const parts = song.tracks.map((t, i) => partXml(song, t, i)).join('');
  const ident = tag(
    'identification', null,
    meta.composer ? leaf('creator', meta.composer, { type: 'composer' }) : '',
    meta.licence ? leaf('rights', meta.licence) : '',
    tag('encoding', null, leaf('software', 'Sixstring Academy')),
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n${tag(
    'score-partwise', { version: '4.0' },
    tag('work', null, leaf('work-title', meta.title)),
    ident,
    tag('part-list', null, partList),
    parts,
  )}\n`;
}

function partXml(song: Song, track: Track, index: number): string {
  const tuning = trackTuning(song, track);
  const capo = trackCapo(song, track);
  const keyAt: string[] = [];
  let key = song.key ?? 'C';
  song.bars.forEach((b, i) => {
    if (b.key) key = b.key;
    keyAt[i] = key;
  });
  // Which notes start a tie, a hammer-on/pull-off or a slide (songs mark the note that is reached).
  const startsTie = new Set<Note>();
  const startsLegato = new Map<Note, 'hammer-on' | 'pull-off' | 'slide'>();
  const stopsLegato = new Map<Note, 'hammer-on' | 'pull-off' | 'slide'>();
  const last = new Map<number, Note>();
  for (const m of track.measures) {
    for (const b of m.beats) {
      if (!b.notes.length && !b.slash) last.clear();
      for (const n of b.notes) {
        const prev = last.get(n.string);
        if (prev && n.tie) startsTie.add(prev);
        if (prev && (n.legato || n.slide)) {
          const what = n.slide ? 'slide' : n.legato === 'hammer' ? 'hammer-on' : 'pull-off';
          startsLegato.set(prev, what);
          stopsLegato.set(n, what);
        }
      }
      for (const n of b.notes) last.set(n.string, n);
    }
  }
  let lyricOpen = false;
  const measures = track.measures.map((measure, bar) => {
    const info = song.bars[bar];
    const prevInfo = song.bars[bar - 1];
    const out: string[] = [];
    const attrs: string[] = [];
    if (bar === 0) attrs.push(leaf('divisions', PPQ));
    if (bar === 0 || info.key) {
      const k = getKey(keyAt[bar]);
      attrs.push(tag('key', null, leaf('fifths', k?.fifths ?? 0), leaf('mode', k?.mode ?? 'major')));
    }
    if (bar === 0 || prevInfo.time.numerator !== info.time.numerator || prevInfo.time.denominator !== info.time.denominator) {
      attrs.push(tag('time', null, leaf('beats', info.time.numerator), leaf('beat-type', info.time.denominator)));
    }
    if (bar === 0) {
      attrs.push(tag('clef', null, leaf('sign', 'G'), leaf('line', 2), leaf('clef-octave-change', -1)));
      attrs.push(tag(
        'staff-details', null,
        leaf('staff-lines', tuning.length),
        ...tuning.map((m, i) => {
          const n = parseNote(midiToNote(m))!;
          return tag('staff-tuning', { line: i + 1 }, leaf('tuning-step', n.letter), n.alt ? leaf('tuning-alter', n.alt) : '', leaf('tuning-octave', n.octave!));
        }),
        capo ? leaf('capo', capo) : '',
      ));
    }
    if (info.repeatStart || (info.ending && !(prevInfo?.ending && prevInfo.ending.join() === info.ending.join() && !prevInfo.repeatEnd))) {
      out.push(tag(
        'barline', { location: 'left' },
        info.repeatStart ? leaf('bar-style', 'heavy-light') : '',
        info.ending && !(prevInfo?.ending && prevInfo.ending.join() === info.ending.join() && !prevInfo.repeatEnd) ? tag('ending', { number: info.ending.join(', '), type: 'start' }) : '',
        info.repeatStart ? tag('repeat', { direction: 'forward' }) : '',
      ));
    }
    if (attrs.length) out.push(tag('attributes', null, ...attrs));
    if (index === 0) {
      const section = song.sections.find((s) => s.start === bar);
      if (section) out.push(tag('direction', { placement: 'above' }, tag('direction-type', null, leaf('rehearsal', section.name))));
    }
    const tempos = index === 0 ? song.tempo.filter((t) => t.bar === bar) : [];
    const chords = index === 0 ? song.chords.filter((c) => c.bar === bar) : [];
    const words = index === 0 ? song.annotations.filter((a) => a.bar === bar) : [];
    measure.beats.forEach((beat) => {
      const end = beat.start + beat.duration;
      const within = (t: number) => t >= beat.start && t < end;
      for (const t of tempos.filter((t) => within(t.tick ?? 0))) {
        out.push(tag('direction', { placement: 'above' }, tag('direction-type', null, tag('metronome', null, leaf('beat-unit', 'quarter'), leaf('per-minute', t.bpm))), tag('sound', { tempo: t.bpm })));
      }
      for (const a of words.filter((a) => within(a.tick))) out.push(tag('direction', { placement: 'above' }, tag('direction-type', null, leaf('words', a.text)), (a.tick - beat.start) ? leaf('offset', a.tick - beat.start) : ''));
      for (const c of chords.filter((c) => within(c.tick))) out.push(harmonyXml(c.symbol, c.tick - beat.start));
      const value = valueOf(beat);
      const lyricXml = (): string => {
        if (!beat.lyric) return '';
        const cont = beat.lyric.endsWith('-');
        const syllabic = lyricOpen ? (cont ? 'middle' : 'end') : cont ? 'begin' : 'single';
        lyricOpen = cont;
        return tag('lyric', { number: 1 }, leaf('syllabic', syllabic), leaf('text', beat.lyric.replace(/-$/, '')));
      };
      if (!beat.notes.length) {
        if (beat.slash) {
          out.push(tag('note', null, pitchXml(71, 'C'), leaf('duration', beat.duration), leaf('voice', 1), typeXml(value), leaf('stem', 'none'), leaf('notehead', 'slash'),
            beat.stroke ? tag('notations', null, tag('technical', null, tag(beat.stroke === 'down' ? 'down-bow' : 'up-bow', null))) : '', lyricXml()));
        } else {
          const whole = beat.start === 0 && beat.duration === barLength(info);
          out.push(tag('note', null, tag('rest', whole ? { measure: 'yes' } : null), leaf('duration', beat.duration), leaf('voice', 1), whole ? '' : typeXml(value)));
        }
        return;
      }
      const notes = [...beat.notes].sort((a, b) => a.midi - b.midi);
      notes.forEach((n, k) => {
        const technical: string[] = [];
        if (stopsLegato.get(n) === 'hammer-on' || stopsLegato.get(n) === 'pull-off') technical.push(tag(stopsLegato.get(n)!, { type: 'stop' }));
        if (startsLegato.get(n) === 'hammer-on' || startsLegato.get(n) === 'pull-off') technical.push(leaf(startsLegato.get(n)!, startsLegato.get(n) === 'hammer-on' ? 'H' : 'P', { type: 'start' }));
        if (n.bend) technical.push(tag('bend', null, leaf('bend-alter', n.bend.amount), n.bend.pre ? tag('pre-bend', null) : '', n.bend.release ? tag('release', null) : ''));
        if (n.harmonic) technical.push(tag('harmonic', null, tag(n.harmonic === 'artificial' ? 'artificial' : 'natural', null)));
        if (n.tap) technical.push(tag('tap', null));
        if (n.finger !== undefined) technical.push(leaf('fingering', n.finger));
        if (n.pluck) technical.push(leaf('pluck', n.pluck));
        if (n.palmMute) technical.push(leaf('other-technical', 'P.M.'));
        if (k === 0 && beat.stroke) technical.push(tag(beat.stroke === 'down' ? 'down-bow' : 'up-bow', null));
        technical.push(leaf('string', n.string), leaf('fret', n.fret));
        const arts: string[] = [];
        if (n.staccato) arts.push(tag('staccato', null));
        if (n.accent) arts.push(tag('accent', null));
        const notations = [
          n.tie ? tag('tied', { type: 'stop' }) : '',
          startsTie.has(n) ? tag('tied', { type: 'start' }) : '',
          stopsLegato.get(n) === 'slide' ? tag('slide', { type: 'stop' }) : '',
          startsLegato.get(n) === 'slide' ? tag('slide', { type: 'start' }) : '',
          tag('technical', null, ...technical),
          arts.length ? tag('articulations', null, ...arts) : '',
          n.vibrato ? tag('ornaments', null, tag('wavy-line', { type: 'start' })) : '',
        ];
        out.push(tag(
          'note', null,
          k > 0 ? tag('chord', null) : '',
          pitchXml(n.midi, keyAt[bar]),
          leaf('duration', beat.duration),
          n.tie ? tag('tie', { type: 'stop' }) : '',
          startsTie.has(n) ? tag('tie', { type: 'start' }) : '',
          leaf('voice', 1),
          typeXml(value),
          n.dead ? leaf('notehead', 'x') : n.ghost ? leaf('notehead', 'normal', { parentheses: 'yes' }) : '',
          tag('notations', null, ...notations),
          k === 0 ? lyricXml() : '',
        ));
      });
    });
    const endsEnding = info.ending && (info.repeatEnd !== undefined || !song.bars[bar + 1]?.ending || song.bars[bar + 1].ending!.join() !== info.ending.join());
    if (info.repeatEnd || endsEnding) {
      out.push(tag(
        'barline', { location: 'right' },
        leaf('bar-style', info.repeatEnd ? 'light-heavy' : 'light-light'),
        endsEnding ? tag('ending', { number: info.ending!.join(', '), type: info.repeatEnd ? 'stop' : 'discontinue' }) : '',
        info.repeatEnd ? tag('repeat', { direction: 'backward', ...(info.repeatEnd !== 2 ? { times: info.repeatEnd } : {}) }) : '',
      ));
    } else if (bar === song.bars.length - 1) {
      out.push(tag('barline', { location: 'right' }, leaf('bar-style', 'light-heavy')));
    }
    return tag('measure', { number: bar + 1, ...(info.length !== undefined && bar === 0 ? { implicit: 'yes' } : {}) }, ...out);
  });
  return tag('part', { id: `P${index + 1}` }, ...measures);
}
