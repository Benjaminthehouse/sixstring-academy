/**
 * SixTab: the compact, hand-typed song format of the app (grammar and examples in API.md).
 *
 *   title: Ode to Joy            <- header fields before the first music line
 *   tempo: 100
 *   [Theme]                      <- a section starts at the next bar
 *   | "D" q 2:3 2:3 1:0 1:2 | "A" 1:2 1:0 2:3 2:2 |
 *   lyrics: Joy- ful, joy- ful, ...
 *
 * The parser is strict: every bar must add up exactly, every token must be known, and each error
 * says where (line, column) and what was expected. It collects every error it can rather than
 * stopping at the first.
 */
import { customTuning, parseFrets, tuning as resolveTuning } from '@/core/guitar';
import { isNoChord, parseChord } from '@/core/theory';
import { MAX_FRET, barCapacity, formatTimeSig, midiOf, parseTimeSig, slugify, tupletNormal, uniqueId, valueTicks } from './model';
import type { Annotation, BarInfo, Beat, ChordEvent, LeftFinger, Measure, Note, NoteValue, RightFinger, Section, Song, SongMeta, StrumPattern, TempoChange, TimeSig, Track, TrackRole } from './types';
import { describeTicks, validateSong } from './validate';

/** One problem in a SixTab text. Lines and columns are 1-based. */
export interface SixTabError {
  line: number;
  column: number;
  message: string;
  /** What the parser was looking for, when it was looking for something. */
  expected?: string;
  /** The text it found instead. */
  found?: string;
}

/** Result of `parseSixTab`. `song` is null when there are errors. */
export interface SixTabResult {
  song: Song | null;
  errors: SixTabError[];
  warnings: SixTabError[];
}

/** Thrown by `sixTab()` when the text has errors; `errors` lists them all. */
export class SixTabSyntaxError extends Error {
  constructor(readonly errors: SixTabError[], title?: string) {
    super(`SixTab${title ? ` "${title}"` : ''} has ${errors.length} error${errors.length === 1 ? '' : 's'}:\n${errors.map(formatSixTabError).join('\n')}`);
    this.name = 'SixTabSyntaxError';
  }
}

/** `line 4, column 12: ... (expected ...)` */
export function formatSixTabError(e: SixTabError): string {
  return `line ${e.line}, column ${e.column}: ${e.message}${e.expected ? ` (expected ${e.expected}${e.found !== undefined ? `, found "${e.found}"` : ''})` : ''}`;
}

/**
 * Parse SixTab into a song, throwing `SixTabSyntaxError` on any error. Works as a tagged template
 * too: sixTab`title: Scale ...`.
 */
export function sixTab(text: string | TemplateStringsArray, ...values: unknown[]): Song {
  const source = typeof text === 'string' ? text : String.raw({ raw: text }, ...values);
  const result = parseSixTab(source);
  if (!result.song) throw new SixTabSyntaxError(result.errors, /title:\s*(.*)/.exec(source)?.[1]?.trim());
  return result.song;
}

/** Options for `parseSixTab`. */
export interface SixTabParseOptions {
  /** Id when the text has no `id:` (default: from the title). */
  id?: string;
}

const HEADER_KEYS = new Set(['title', 'id', 'composer', 'artist', 'arranger', 'source', 'licence', 'license', 'difficulty', 'tags', 'tempo', 'time', 'key', 'tuning', 'capo', 'pickup']);
const BODY_KEYS = new Set(['tempo', 'time', 'key', 'track', 'role', 'tuning', 'capo', 'strum', 'lyrics']);
const DURATION_LETTERS: Record<string, number> = { w: 1, h: 2, q: 4, e: 8, s: 16 };
const DURATION_RE = /^(?:([whqes])|\/(64|32|16|8|4|2|1))(\.{0,2})(\d+)?$/;

type TokenKind = 'bar' | 'ending' | 'chord' | 'annotation' | 'word' | 'group' | 'mods' | 'repeat-bar';

interface Token {
  kind: TokenKind;
  text: string;
  col: number;
  /** For groups: the inner tokens; for words/groups: attached `{...}` modifiers. */
  inner?: Token[];
  mods?: Token;
  line?: number;
}

interface TrackState {
  track: Track;
  /** Time signature this track believes it is in. */
  time: TimeSig;
  tuning: number[];
  capo: number;
  barLines: Array<{ line: number; col: number }>;
  lastOnString: Map<number, Note>;
  /** The beats that the last music line produced, for its lyrics line. */
  lastLineBeats: Beat[] | null;
  hasMusic: boolean;
  roleSet: boolean;
  /** A "|:" closed the previous line: the next bar starts a repeat. */
  startRepeatNext: boolean;
  /** The ending ([1], [2]) that continues into the next bar, until ":|", "||" or a new section. */
  endingCarry: number[] | null;
}

/** Parse SixTab text. Never throws: problems come back in `errors` (and `song` is then null). */
export function parseSixTab(text: string, opts: SixTabParseOptions = {}): SixTabResult {
  const errors: SixTabError[] = [];
  const warnings: SixTabError[] = [];
  const fail = (line: number, column: number, message: string, expected?: string, found?: string) => {
    errors.push({ line, column, message, ...(expected ? { expected } : {}), ...(found !== undefined ? { found } : {}) });
  };
  const warnAt = (line: number, column: number, message: string) => warnings.push({ line, column, message });

  const meta: Partial<SongMeta> = {};
  let songTuning: number[] = [40, 45, 50, 55, 59, 64];
  let songCapo = 0;
  let key: string | undefined;
  let pickup: number | undefined;
  const tempo: TempoChange[] = [];
  let initialTime: TimeSig = { numerator: 4, denominator: 4 };
  const bars: BarInfo[] = [];
  const sections: Section[] = [];
  const chords: ChordEvent[] = [];
  const annotations: Annotation[] = [];
  const tracks: TrackState[] = [];
  const usedIds = new Set<string>();
  let inBody = false;
  let current: TrackState | null = null;
  let duration: { ticks: number; value: NoteValue } | null = null;
  let pendingTime: { time: TimeSig; line: number } | null = null;
  let pendingTempo: { bpm: number; line: number } | null = null;
  let pendingKey: string | null = null;
  let currentSection: Section | null = null;
  /** Where each section header was written, for errors about the section. */
  const sectionAt = new Map<Section, { line: number; column: number }>();

  const newTrack = (name: string): TrackState => {
    const id = uniqueId(slugify(name), usedIds);
    const state: TrackState = {
      track: { id, name, role: 'lead', measures: [] },
      time: { ...initialTime }, tuning: songTuning, capo: songCapo, barLines: [], lastOnString: new Map(),
      lastLineBeats: null, hasMusic: false, roleSet: false, startRepeatNext: false, endingCarry: null,
    };
    tracks.push(state);
    return state;
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const content = stripComment(raw);
    const trimmed = content.trim();
    if (!trimmed) return;
    const lead = content.length - content.trimStart().length + 1;

    // [Section]
    const sectionMatch = /^\[([^\]]*)\]$/.exec(trimmed);
    if (sectionMatch && !/^\[\d+(,\d+)*\]/.test(trimmed)) {
      const name = sectionMatch[1].trim();
      if (!name) {
        fail(lineNo, lead, 'A section needs a name.', 'a name like [Verse]', trimmed);
        return;
      }
      inBody = true;
      if (!current) current = newTrack('Guitar');
      current.endingCarry = null;
      if (current === tracks[0]) {
        const start = current.track.measures.length;
        if (currentSection) currentSection.end = start;
        if (currentSection && currentSection.end === currentSection.start) {
          fail(lineNo, lead, `Section "${currentSection.name}" has no bars before "${name}" starts.`);
        }
        currentSection = { name, start, end: start };
        sectionAt.set(currentSection, { line: lineNo, column: lead });
        sections.push(currentSection);
      } else {
        const at = current.track.measures.length;
        const match = sections.find((s) => s.start === at && s.name === name);
        if (!match) fail(lineNo, lead, `Section "${name}" in track "${current.track.name}" starts at bar ${at + 1}, but the first track has no "${name}" section there.`);
      }
      return;
    }

    // key: value
    const field = /^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/.exec(trimmed);
    if (field && !trimmed.startsWith('|')) {
      const name = field[1].toLowerCase();
      const value = field[2].trim();
      const valueCol = lead + trimmed.indexOf(field[2]);
      if (!inBody) {
        if (!HEADER_KEYS.has(name)) {
          if (BODY_KEYS.has(name)) inBody = true;
          else {
            fail(lineNo, lead, `Unknown header field "${field[1]}".`, `one of ${[...HEADER_KEYS].join(', ')}`, field[1]);
            return;
          }
        }
      }
      if (!inBody) {
        readHeader(name, value, lineNo, valueCol);
        return;
      }
      readDirective(name, value, lineNo, valueCol, lead);
      return;
    }

    if (trimmed.startsWith('|') || trimmed.startsWith(':|')) {
      inBody = true;
      if (!current) current = newTrack('Guitar');
      readMusicLine(current, content, lineNo);
      return;
    }

    fail(lineNo, lead, 'This line is not SixTab.', 'a header like "title: ...", a section like [Verse], a music line starting with |, or "lyrics: ..."', trimmed.slice(0, 24));
  });

  // ---- header fields --------------------------------------------------------------------
  function readHeader(name: string, value: string, line: number, col: number): void {
    switch (name) {
      case 'title': case 'composer': case 'artist': case 'arranger': case 'source':
        if (!value) fail(line, col, `"${name}" is empty.`);
        else meta[name] = value;
        return;
      case 'licence': case 'license':
        meta.licence = value;
        return;
      case 'id':
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) fail(line, col, `The id "${value}" must be lowercase letters, digits and single hyphens.`, 'an id like amazing-grace', value);
        else meta.id = value;
        return;
      case 'difficulty': {
        const d = Number(value);
        if (!Number.isInteger(d) || d < 1 || d > 10) fail(line, col, 'Difficulty is a whole number from 1 to 10.', '1–10', value);
        else meta.difficulty = d;
        return;
      }
      case 'tags':
        meta.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
        return;
      case 'tempo': {
        const bpm = readTempo(value, line, col);
        if (bpm !== null) tempo.splice(0, tempo.length, { bar: 0, bpm });
        return;
      }
      case 'time': {
        const t = parseTimeSig(value);
        if (!t) fail(line, col, 'Not a time signature.', 'a time signature like 4/4, 3/4 or 6/8', value);
        else initialTime = t;
        return;
      }
      case 'key':
        if (!readKey(value, line, col)) return;
        key = value;
        return;
      case 'tuning': {
        const t = readTuning(value, line, col);
        if (t) songTuning = t;
        return;
      }
      case 'capo': {
        const c = readCapo(value, line, col);
        if (c !== null) songCapo = c;
        return;
      }
      case 'pickup': {
        const d = DURATION_RE.exec(value.trim());
        if (!d) {
          fail(line, col, 'The pickup is given as one duration: how long the first, incomplete bar is.', 'a duration like q, e, h.', value);
          return;
        }
        if (d[4] && (Number(d[4]) < 2 || Number(d[4]) > 13)) {
          fail(line, col, 'A tuplet is 2 to 13 notes in the time of the usual count.', 'a duration like q, e, h.', value);
          return;
        }
        pickup = valueTicks(durationValue(d));
        return;
      }
    }
  }

  function readTempo(value: string, line: number, col: number): number | null {
    const bpm = Number(value.replace(/\s*bpm$/i, ''));
    if (!Number.isFinite(bpm) || bpm < 10 || bpm > 500) {
      fail(line, col, 'Tempo is quarter notes per minute, 10 to 500.', 'a number like 90', value);
      return null;
    }
    return bpm;
  }

  function readKey(value: string, line: number, col: number): boolean {
    const k = value.trim();
    const m = /^([A-G](?:#|b)?)\s*(m|min|minor|maj|major)?$/i.exec(k);
    if (!m || !/^[A-G]/.test(k)) {
      fail(line, col, 'Not a key.', 'a key like G, Em, F# minor or Bb major', value);
      return false;
    }
    return true;
  }

  function readTuning(value: string, line: number, col: number): number[] | null {
    const v = value.trim();
    try {
      if (/^[A-Ga-g]/.test(v) && /\s/.test(v)) return [...customTuning(v.split(/\s+/)).midi];
      if (/^(\d+\s+)+\d+$/.test(v)) {
        const midi = v.split(/\s+/).map(Number);
        if (midi.length > 12 || midi.some((m) => m < 12 || m > 96)) {
          fail(line, col, `The tuning "${value}" has impossible pitches: open strings are MIDI notes 12 to 96, low to high, at most 12 strings.`, 'MIDI numbers like 40 45 50 55 59 64', value);
          return null;
        }
        return midi;
      }
      return [...resolveTuning(v).midi];
    } catch {
      fail(line, col, `Unknown tuning "${value}".`, 'a tuning name (standard, drop-d, dadgad, open-g, bass) or the open strings low to high (D A D G B E)', value);
      return null;
    }
  }

  function readCapo(value: string, line: number, col: number): number | null {
    const c = Number(value);
    if (!Number.isInteger(c) || c < 0 || c > 12) {
      fail(line, col, 'Capo is a fret number from 0 to 12.', '0–12', value);
      return null;
    }
    return c;
  }

  // ---- body directives ------------------------------------------------------------------
  function readDirective(name: string, value: string, line: number, col: number, lead: number): void {
    if (!BODY_KEYS.has(name)) {
      fail(line, lead, `"${name}:" cannot be used after the music has started.`, `one of ${[...BODY_KEYS].join(', ')}`, name);
      return;
    }
    switch (name) {
      case 'track': {
        if (!value) {
          fail(line, col, 'A track needs a name.', 'a name like "track: Bass"');
          return;
        }
        if (current && !current.hasMusic && current.track.name === 'Guitar' && tracks.length === 1 && current.track.measures.length === 0) {
          // Nothing was written into the implicit track yet: name it instead of adding one.
          usedIds.delete(current.track.id);
          current.track.id = uniqueId(slugify(value), usedIds);
          current.track.name = value;
        } else {
          current = newTrack(value);
        }
        duration = null;
        return;
      }
      case 'role': {
        if (!current) current = newTrack('Guitar');
        if (!['lead', 'rhythm', 'bass'].includes(value)) {
          fail(line, col, 'Unknown track role.', 'lead, rhythm or bass', value);
          return;
        }
        if (current.hasMusic) fail(line, lead, '"role:" must come before the track\'s first music line.');
        current.track.role = value as TrackRole;
        current.roleSet = true;
        return;
      }
      case 'tuning': case 'capo': {
        if (current?.hasMusic) {
          fail(line, lead, `"${name}:" must come before the track's first music line (a tuning or capo cannot change mid-song).`);
          return;
        }
        const t = name === 'tuning' ? readTuning(value, line, col) : readCapo(value, line, col);
        if (t === null) return;
        // Before the first track's music it is the song's setting; in a later track, that track's own.
        if (!current || current === tracks[0]) {
          if (name === 'tuning') songTuning = t as number[];
          else songCapo = t as number;
          if (current) {
            current.tuning = songTuning;
            current.capo = songCapo;
          }
        } else if (name === 'tuning') {
          current.tuning = t as number[];
          current.track.tuning = t as number[];
        } else {
          current.capo = t as number;
          current.track.capo = t as number;
        }
        return;
      }
      case 'tempo': {
        const bpm = readTempo(value, line, col);
        if (bpm !== null) pendingTempo = { bpm, line };
        return;
      }
      case 'time': {
        const t = parseTimeSig(value);
        if (!t) fail(line, col, 'Not a time signature.', 'a time signature like 4/4, 3/4 or 6/8', value);
        else pendingTime = { time: t, line };
        return;
      }
      case 'key':
        if (readKey(value, line, col)) pendingKey = value.trim();
        return;
      case 'strum': {
        const pattern = value.replace(/\s+/g, '');
        if (!/^[DUXdux.\-]+$/.test(pattern)) {
          fail(line, col, 'A strum pattern uses D (down), U (up), X (muted) and - (skip), one character per step.', 'a pattern like D-DU-UDU', value);
          return;
        }
        if (!currentSection) {
          fail(line, lead, 'Put "strum:" under a section header such as [Verse]: the pattern belongs to that section.');
          return;
        }
        const strum: StrumPattern = { pattern: pattern.toUpperCase().replace(/\./g, '-') };
        currentSection.strum = strum;
        return;
      }
      case 'lyrics':
        readLyrics(value, line, col);
        return;
    }
  }

  function readLyrics(value: string, line: number, col: number): void {
    const state = current;
    if (!state || !state.lastLineBeats) {
      fail(line, col, '"lyrics:" must come right after the music line it is sung to.');
      return;
    }
    const targets = state.lastLineBeats.filter((b) => b.slash || (b.notes.length > 0 && !b.notes.every((n) => n.tie)));
    const syllables: Array<{ text: string; col: number }> = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value))) {
      const word = m[0];
      // "A-maz-ing" is three syllables, the same as "A- maz- ing".
      const parts = word === '-' ? [word] : word.split(/(?<=-)(?=[^-])/);
      let offset = 0;
      for (const p of parts) {
        syllables.push({ text: p, col: col + m.index + offset });
        offset += p.length;
      }
    }
    if (syllables.length > targets.length) {
      const extra = syllables[targets.length];
      fail(line, extra.col, `This lyrics line has ${syllables.length} syllables but the music line above has ${targets.length} notes to sing them on.`, 'one syllable (or _ to skip) per note', extra.text);
      return;
    }
    syllables.forEach((s, i) => {
      if (s.text === '_') return;
      targets[i].lyric = s.text;
    });
    state.lastLineBeats = null;
  }

  // ---- music ----------------------------------------------------------------------------
  function readMusicLine(state: TrackState, content: string, line: number): void {
    const tokens = tokenizeMusic(content, line, fail);
    if (!tokens) return;
    if (!tokens.length || tokens[0].kind !== 'bar') {
      fail(line, tokens[0]?.col ?? 1, 'A music line starts with a bar line.', '|', tokens[0]?.text);
      return;
    }
    if (tokens[tokens.length - 1].kind !== 'bar') {
      const last = tokens[tokens.length - 1];
      fail(line, last.col + last.text.length, 'A music line ends with a bar line: close the last bar.', '|');
    }
    state.hasMusic = true;
    if (!state.roleSet && state === tracks[0]) state.track.role = 'lead';
    const lineBeats: Beat[] = [];
    let beats: Beat[] | null = null;
    let barStartCol = tokens[0].col;
    let barTick = 0;
    let barIndex = state.track.measures.length;
    let barFlags: Partial<BarInfo> = {};
    let pendingChord: Token | null = null;
    let pendingAnnotations: Token[] = [];
    let barHasContent = false;
    let repeatBarPrev: Measure | null = null;
    /** An error inside the bar already explains why it may not add up: do not repeat it as a bar-length error. */
    let barBroken = false;
    const errorsBefore = () => errors.length;
    let errorMark = errorsBefore();

    const openBar = (tok: Token) => {
      beats = [];
      barTick = 0;
      barStartCol = tok.col;
      barIndex = state.track.measures.length;
      barFlags = state.startRepeatNext ? { repeatStart: true } : {};
      if (state.endingCarry) barFlags.ending = [...state.endingCarry];
      state.startRepeatNext = false;
      barHasContent = false;
      repeatBarPrev = null;
      barBroken = false;
      errorMark = errorsBefore();
    };

    const closeBar = (tok: Token) => {
      if (!beats) return;
      if (pendingChord) fail(line, pendingChord.col, `Chord symbol ${pendingChord.text} is not followed by a beat in its bar.`, 'a note, rest or slash after the chord symbol');
      if (pendingAnnotations.length) fail(line, pendingAnnotations[0].col, 'This annotation is not followed by a beat in its bar.', 'a note, rest or slash after it');
      pendingChord = null;
      pendingAnnotations = [];
      if (!barHasContent) {
        // "| |" or a line's leading bar line: nothing to close.
        beats = null;
        return;
      }
      const isFirstTrack = state === tracks[0];
      const time = takeTimeFor(state);
      const info: BarInfo = isFirstTrack ? { time } : bars[barIndex] ?? { time };
      if (isFirstTrack) {
        if (pendingTempo) {
          tempo.push({ bar: barIndex, bpm: pendingTempo.bpm });
          pendingTempo = null;
        }
        if (pendingKey) {
          if (barIndex === 0) key = pendingKey;
          else info.key = pendingKey;
          pendingKey = null;
        }
        if (barIndex === 0 && pickup !== undefined) info.length = pickup;
        Object.assign(info, barFlags);
        bars.push(info);
      } else {
        if (!bars[barIndex]) {
          fail(line, barStartCol, `Track "${state.track.name}" has more bars than the first track (${bars.length}).`);
        } else {
          if (formatTimeSig(bars[barIndex].time) !== formatTimeSig(time)) fail(line, barStartCol, `Bar ${barIndex + 1} of "${state.track.name}" is in ${formatTimeSig(time)} but the first track has ${formatTimeSig(bars[barIndex].time)} there.`);
          if (barFlags.repeatStart) bars[barIndex].repeatStart = true;
          if (barFlags.repeatEnd && bars[barIndex].repeatEnd && barFlags.repeatEnd !== bars[barIndex].repeatEnd) fail(line, tok.col, `The repeat count here differs from the first track's (${bars[barIndex].repeatEnd}).`);
          else if (barFlags.repeatEnd) bars[barIndex].repeatEnd = barFlags.repeatEnd;
          if (barFlags.ending) bars[barIndex].ending = barFlags.ending;
        }
        if (pendingTempo) {
          const there = tempo.find((t) => t.bar === barIndex);
          if (!there) tempo.push({ bar: barIndex, bpm: pendingTempo.bpm });
          else if (there.bpm !== pendingTempo.bpm) fail(pendingTempo.line, 1, `The tempo change at bar ${barIndex + 1} (${pendingTempo.bpm}) differs from the first track's (${there.bpm}).`);
        }
        pendingTempo = null;
        pendingKey = null;
      }
      const need = barIndex === 0 && pickup !== undefined ? pickup : barCapacity(time);
      if (errors.length > errorMark) barBroken = true;
      if (barTick !== need && !barBroken) {
        const where = `Bar ${barIndex + 1}${state.track.name !== 'Guitar' || tracks.length > 1 ? ` of "${state.track.name}"` : ''}`;
        const what = barIndex === 0 && pickup !== undefined ? 'the pickup' : formatTimeSig(time);
        const msg = barTick < need
          ? `${where} adds up to ${barTick} ticks but ${what} needs ${need}: ${describeTicks(need - barTick)} is missing.`
          : `${where} adds up to ${barTick} ticks but ${what} needs ${need}: ${describeTicks(barTick - need)} too much.`;
        fail(line, barStartCol, msg, `bar contents adding up to ${need} ticks`);
      }
      state.track.measures.push({ beats });
      state.barLines.push({ line, col: barStartCol });
      lineBeats.push(...beats);
      beats = null;
    };

    const addBeat = (beat: Omit<Beat, 'start' | 'duration'>, tok: Token) => {
      if (!beats) return;
      if (!duration) {
        fail(line, tok.col, 'No duration yet: say how long the notes are before the first one.', 'a duration such as q (quarter), e (eighth), s (sixteenth), h (half), w (whole)', tok.text);
        duration = { ticks: 960, value: { base: 4 } };
      }
      const b: Beat = { ...beat, start: barTick, duration: duration.ticks, value: { ...duration.value } };
      if (pendingChord) {
        const chord = readChordToken(pendingChord, state);
        if (chord) addChord({ bar: barIndex, tick: barTick, ...chord }, pendingChord);
        pendingChord = null;
      }
      for (const a of pendingAnnotations) annotations.push({ bar: barIndex, tick: barTick, text: a.text });
      pendingAnnotations = [];
      beats.push(b);
      barTick += b.duration;
      barHasContent = true;
    };

    const addChord = (c: ChordEvent, tok: Token) => {
      const same = chords.find((x) => x.bar === c.bar && x.tick === c.tick);
      if (same) {
        if (same.symbol !== c.symbol) fail(line, tok.col, `Chord ${c.symbol} clashes with ${same.symbol} written at the same place in another track.`);
        else if (c.voicing && !same.voicing) same.voicing = c.voicing;
        return;
      }
      chords.push(c);
    };

    for (const tok of tokens) {
      if (tok.kind === 'bar') {
        const kind = barKind(tok.text);
        if (beats) {
          if (kind.end && barHasContent) barFlags.repeatEnd = kind.times;
          else if (kind.end && !barHasContent) fail(line, tok.col, 'A repeat sign ":|" needs a bar before it.');
          closeBar(tok);
          if (kind.end || kind.double) state.endingCarry = null;
        } else if (kind.end) {
          // A line that starts with ":|" ends the repeat at the last bar of the line before.
          const prevInfo = bars[state.track.measures.length - 1];
          if (prevInfo) prevInfo.repeatEnd = kind.times;
          else fail(line, tok.col, 'A repeat sign ":|" needs a bar before it.');
        }
        if (kind.start) state.startRepeatNext = true;
        openBar(tok);
        continue;
      }
      if (!beats) openBar(tok);
      switch (tok.kind) {
        case 'ending': {
          if (barHasContent || ((beats as Beat[] | null)?.length ?? 0) > 0) {
            fail(line, tok.col, 'An ending number goes right after the bar line, before the bar\'s music.', '[1] or [2] at the start of the bar');
            break;
          }
          const nums = tok.text.slice(1, -1).split(',').map(Number);
          barFlags.ending = nums;
          state.endingCarry = nums;
          break;
        }
        case 'chord':
          if (pendingChord) fail(line, tok.col, `Two chord symbols in a row (${pendingChord.text} then ${tok.text}): put a beat between them.`, 'a note, rest or slash');
          pendingChord = tok;
          break;
        case 'annotation':
          pendingAnnotations.push(tok);
          break;
        case 'repeat-bar': {
          const prev = state.track.measures[state.track.measures.length - 1];
          if (!prev || barHasContent) {
            fail(line, tok.col, '"%" repeats the previous bar and must stand alone in its bar.', '% alone between bar lines');
            break;
          }
          repeatBarPrev = prev;
          if (pendingChord) {
            const chord = readChordToken(pendingChord, state);
            if (chord) addChord({ bar: barIndex, tick: 0, ...chord }, pendingChord);
            pendingChord = null;
          }
          for (const a of pendingAnnotations) annotations.push({ bar: barIndex, tick: 0, text: a.text });
          pendingAnnotations = [];
          for (const b of prev.beats) {
            const copy: Beat = JSON.parse(JSON.stringify(b));
            delete copy.lyric;
            beats!.push(copy);
            barTick += copy.duration;
            if (!copy.notes.length && !copy.slash) state.lastOnString.clear();
            for (const n of copy.notes) state.lastOnString.set(n.string, n);
          }
          for (const c of chords.filter((x) => x.bar === barIndex - 1 && x.tick > 0)) addChord({ ...c, bar: barIndex }, tok);
          barHasContent = true;
          break;
        }
        case 'word':
        case 'group': {
          if (repeatBarPrev) {
            fail(line, tok.col, '"%" repeats the previous bar and must stand alone in its bar.');
            break;
          }
          if (tok.kind === 'word') {
            const d = DURATION_RE.exec(tok.text);
            if (d && !tok.text.includes(':')) {
              if (tok.mods) fail(line, tok.mods.col, 'A duration takes no modifiers.');
              if (d[4] && (Number(d[4]) < 2 || Number(d[4]) > 13)) {
                fail(line, tok.col, `"${tok.text}": a tuplet is 2 to 13 notes in the time of the usual count (e3 = three eighths in the time of two).`, 'a tuplet digit from 2 to 13, as in e3, s6, q5', tok.text);
                break;
              }
              const value = durationValue(d);
              duration = { ticks: valueTicks(value), value };
              break;
            }
          }
          const beat = readBeat(tok, state, line);
          if (beat) addBeat(beat, tok);
          break;
        }
        default:
          break;
      }
    }
    if (beats && barHasContent) closeBar(tokens[tokens.length - 1]);
    state.lastLineBeats = lineBeats;
  }

  /**
   * The time signature of the bar being closed: a pending `time:` change applies from this bar on.
   * Later tracks follow the first track's bars unless they say otherwise (then the two must agree).
   */
  function takeTimeFor(state: TrackState): TimeSig {
    if (pendingTime) {
      state.time = pendingTime.time;
      pendingTime = null;
    } else if (state !== tracks[0]) {
      const there = bars[state.track.measures.length];
      if (there) state.time = { ...there.time };
    }
    return { ...state.time };
  }

  function readChordToken(tok: Token, state: TrackState): Omit<ChordEvent, 'bar' | 'tick'> | null {
    const [symbolRaw, shape] = tok.text.split('=');
    const symbol = symbolRaw.trim();
    if (!isNoChord(symbol) && !parseChord(symbol)) {
      fail(tok.line ?? 0, tok.col, `"${symbol}" is not a chord symbol the app can read.`, 'a chord symbol like C, Am7, F#m7b5, G/B or N.C.', symbol);
      return null;
    }
    if (shape === undefined) return { symbol };
    try {
      const voicing = parseFrets(shape.trim());
      if (voicing.length !== state.tuning.length) {
        fail(tok.line ?? 0, tok.col, `The shape "${shape}" for ${symbol} has ${voicing.length} strings; the tuning has ${state.tuning.length}.`, `${state.tuning.length} frets, low string first (x32010)`, shape);
        return { symbol };
      }
      return { symbol, voicing };
    } catch {
      fail(tok.line ?? 0, tok.col, `"${shape}" is not a chord shape.`, 'frets low string first, x for a muted string (x32010 or 8-10-10-9-8-8)', shape);
      return { symbol };
    }
  }

  function readBeat(tok: Token, state: TrackState, line: number): Omit<Beat, 'start' | 'duration'> | null {
    const beat: Omit<Beat, 'start' | 'duration'> = { notes: [] };
    if (tok.kind === 'word') {
      const t = tok.text;
      if (t === 'r') {
        if (tok.mods) fail(line, tok.mods.col, 'A rest takes no modifiers.');
        state.lastOnString.clear();
        return beat;
      }
      if (t === '/' || t === 'D' || t === 'U' || t === 'X') {
        beat.slash = true;
        if (t === 'D') beat.stroke = 'down';
        if (t === 'U') beat.stroke = 'up';
        if (t === 'X') beat.mutedStrum = true;
        if (tok.mods) applyMods(tok.mods, beat, null, line);
        return beat;
      }
      const note = readNote(tok.text, tok.col, state, line);
      if (!note) return null;
      beat.notes.push(note);
      if (tok.mods) applyMods(tok.mods, beat, note, line);
    } else {
      const inner = tok.inner ?? [];
      if (!inner.length) {
        fail(line, tok.col, 'An empty chord group.', 'notes inside the brackets: (3:2 2:3 1:2)');
        return null;
      }
      for (const n of inner) {
        if (n.kind !== 'word') {
          fail(line, n.col, 'Only notes belong inside a chord group.', 'string:fret', n.text);
          continue;
        }
        const note = readNote(n.text, n.col, state, line);
        if (!note) continue;
        if (beat.notes.some((x) => x.string === note.string)) {
          fail(line, n.col, `Two notes on string ${note.string} in one chord: a string plays one note at a time.`);
          continue;
        }
        beat.notes.push(note);
        if (n.mods) applyMods(n.mods, null, note, line);
      }
      if (tok.mods) applyMods(tok.mods, beat, null, line);
      beat.notes.sort((a, b) => b.string - a.string);
    }
    for (const n of beat.notes) state.lastOnString.set(n.string, n);
    return beat;
  }

  function readNote(text: string, col: number, state: TrackState, line: number): Note | null {
    const m = /^([/\\])?(\d+):(\d+|x|-|\(\d+\)|<\d+>)(.*)$/.exec(text);
    if (!m) {
      if (/^\d+:/.test(text) || /^[/\\]\d+:/.test(text)) {
        fail(line, col + text.indexOf(':') + 1, `"${text}" has no fret after the colon.`, 'a fret number, x (dead), - (tie), (n) ghost or <n> harmonic', text);
      } else if (/^\d+$/.test(text)) {
        fail(line, col, `"${text}" is a number on its own.`, 'a note written string:fret, like 3:5', text);
      } else {
        fail(line, col, `Unexpected "${text}".`, 'a note like 3:5, a chord (3:2 2:3), a rest r, a slash / D U X, a duration q e s h w, a chord symbol "G" or a bar line |', text);
      }
      return null;
    }
    const string = Number(m[2]);
    if (string < 1 || string > state.tuning.length) {
      fail(line, col, `There is no string ${string}: the tuning has strings 1–${state.tuning.length} (1 is the thinnest).`, `a string from 1 to ${state.tuning.length}`, m[2]);
      return null;
    }
    const fretText = m[3];
    let fret: number;
    const note: Partial<Note> = { string };
    if (fretText === '-') {
      const prev = state.lastOnString.get(string);
      if (!prev) {
        fail(line, col, `"${text}" ties string ${string}, but nothing is ringing on that string to tie from.`, 'an earlier note on that string (a rest stops all ties)');
        return null;
      }
      fret = prev.fret;
      note.tie = true;
      if (prev.harmonic) note.harmonic = prev.harmonic;
    } else if (fretText === 'x') {
      fret = 0;
      note.dead = true;
    } else if (fretText.startsWith('(')) {
      fret = Number(fretText.slice(1, -1));
      note.ghost = true;
    } else if (fretText.startsWith('<')) {
      fret = Number(fretText.slice(1, -1));
      note.harmonic = 'natural';
    } else {
      fret = Number(fretText);
    }
    if (fret > MAX_FRET) {
      fail(line, col + text.indexOf(':') + 1, `Fret ${fret} is beyond the neck.`, `a fret from 0 to ${MAX_FRET}`, String(fret));
      return null;
    }
    note.fret = fret;
    note.midi = midiOf(string, fret, state.tuning, state.capo);
    if (m[1] === '/') note.slideIn = 'below';
    if (m[1] === '\\') note.slideIn = 'above';
    // Suffixes: h p s t ~ > r / \ and b[amount], each at most once.
    const suffix = m[4];
    const suffixCol = col + text.length - suffix.length;
    const seen = new Set<string>();
    for (let i = 0; i < suffix.length; i++) {
      const ch = suffix[i];
      const at = suffixCol + i;
      const once = (k: string) => {
        if (seen.has(k)) fail(line, at, `"${k}" appears twice on one note.`);
        seen.add(k);
      };
      switch (ch) {
        case 'h': once('h'); note.legato = 'hammer'; break;
        case 'p': once('p'); note.legato = 'pull'; break;
        case 's': once('s'); note.slide = 'up'; break;
        case 't': once('t'); note.tap = true; break;
        case '~': once('~'); note.vibrato = true; break;
        case '>': once('>'); note.accent = true; break;
        case 'r':
          once('r');
          if (!note.bend) fail(line, at, '"r" (release) needs a bend before it on the same note.', 'b before r, as in 3:7b2r', suffix);
          else note.bend.release = true;
          break;
        case '/': once('/'); note.slideOut = 'up'; break;
        case '\\': once('\\'); note.slideOut = 'down'; break;
        case 'b': {
          once('b');
          const num = /^\d+(\.\d+)?/.exec(suffix.slice(i + 1));
          const amount = num ? Number(num[0]) : 2;
          if (!(amount > 0 && amount <= 4)) fail(line, at, `A bend of ${amount} semitones is not playable.`, 'b0.5, b1 (half step), b2 (full, the default), b3 or b4');
          note.bend = { amount };
          if (num) i += num[0].length;
          break;
        }
        default:
          fail(line, at, `Unknown technique "${ch}" on ${text}.`, 'h p s t ~ > b r / \\ after the fret, or {…} modifiers such as {pm}', suffix.slice(i));
          i = suffix.length;
      }
    }
    if (note.legato || note.slide) {
      const prev = state.lastOnString.get(string);
      const what = note.legato === 'hammer' ? 'hammer-on' : note.legato === 'pull' ? 'pull-off' : 'slide';
      if (!prev) fail(line, col, `The ${what} on ${text} has no earlier note on string ${string} to start from.`, `a note on string ${string} before it (a rest stops it)`);
      else if (prev.fret === fret) fail(line, col, `The ${what} on ${text} starts and ends on fret ${fret}.`);
      else {
        if (note.slide) note.slide = fret > prev.fret ? 'up' : 'down';
        if (note.legato === 'hammer' && fret < prev.fret) fail(line, col, `${text} is marked as a hammer-on (h) but goes down from fret ${prev.fret}: that is a pull-off (p).`);
        if (note.legato === 'pull' && fret > prev.fret) fail(line, col, `${text} is marked as a pull-off (p) but goes up from fret ${prev.fret}: that is a hammer-on (h).`);
      }
    }
    return note as Note;
  }

  function applyMods(tok: Token, beat: Omit<Beat, 'start' | 'duration'> | null, note: Note | null, line: number): void {
    const words = tok.text.slice(1, -1).split(/[\s,]+/).filter(Boolean);
    let offset = 1;
    const targets = (): Note[] => (note ? [note] : beat?.notes ?? []);
    for (const w of words) {
      const at = tok.col + tok.text.indexOf(w, offset);
      offset = tok.text.indexOf(w, offset) + w.length;
      const each = (fn: (n: Note) => void) => {
        const list = targets();
        if (!list.length) fail(line, at, `"${w}" needs a note to apply to.`);
        list.forEach(fn);
      };
      switch (w) {
        case 'pm': each((n) => { n.palmMute = true; }); break;
        case 'lr': each((n) => { n.letRing = true; }); break;
        case 'st': each((n) => { n.staccato = true; }); break;
        case 'ac': each((n) => { n.accent = true; }); break;
        case 'vib': each((n) => { n.vibrato = true; }); break;
        case 'x': each((n) => { n.dead = true; }); break;
        case 'gh': each((n) => { n.ghost = true; }); break;
        case 'nh': each((n) => { n.harmonic = 'natural'; }); break;
        case 'ah': each((n) => { n.harmonic = 'artificial'; }); break;
        case 'tap': each((n) => { n.tap = true; }); break;
        case 'pre': each((n) => {
          if (!n.bend) fail(line, at, '"pre" (pre-bend) needs a bend on the note, as in 3:7b2{pre}.');
          else n.bend.pre = true;
        }); break;
        case 'dn': case 'up':
          if (!beat) fail(line, at, `"${w}" is a pick or strum direction for the whole beat: put it after the chord group, as in (3:2 2:3){${w}}.`);
          else beat.stroke = w === 'dn' ? 'down' : 'up';
          break;
        case '0': case '1': case '2': case '3': case '4': case 'T': {
          const finger: LeftFinger = w === 'T' ? 'T' : (Number(w) as LeftFinger);
          const list = targets();
          if (list.length !== 1) fail(line, at, `A finger (${w}) belongs to one note: inside a chord, write it on each note, as in (3:2{2} 2:3{3}).`);
          else list[0].finger = finger;
          break;
        }
        case 'P': case 'I': case 'M': case 'A': case 'C': {
          const list = targets();
          if (list.length !== 1) fail(line, at, `A picking finger (${w}) belongs to one note: inside a chord, write it on each note.`);
          else list[0].pluck = w.toLowerCase() as RightFinger;
          break;
        }
        default: {
          const technique = ['h', 'p', 's', 'b', 'r', 't', '~'].includes(w) ? ` A technique "${w}" is written straight after the fret (3:5${w}), not in braces.` : '';
          const finger = ['p', 'i', 'm', 'a', 'c'].includes(w) ? ' Picking fingers are capital letters: P I M A C.' : '';
          const hint = technique + finger;
          fail(line, at, `Unknown modifier "${w}".${hint}`, 'pm lr st ac vib x gh nh ah tap pre dn up, a finger 0–4 or T, or a picking finger P I M A C', w);
        }
      }
    }
  }

  // ---- assemble ---------------------------------------------------------------------------
  if (!tracks.length || !tracks[0].track.measures.length) {
    if (!errors.length) errors.push({ line: lines.length, column: 1, message: 'The song has no music.', expected: 'at least one music line such as | q 3:0 3:2 2:0 2:2 |' });
  }
  const lastSection = currentSection as Section | null;
  if (lastSection && tracks[0]) lastSection.end = tracks[0].track.measures.length;
  for (const s of sections) if (s.end <= s.start) errors.push({ ...(sectionAt.get(s) ?? { line: 1, column: 1 }), message: `Section "${s.name}" has no bars.` });
  for (const t of tracks.slice(1)) {
    if (t.track.measures.length !== bars.length) {
      const last = t.barLines[t.barLines.length - 1];
      errors.push({ line: last?.line ?? 1, column: last?.col ?? 1, message: `Track "${t.track.name}" has ${t.track.measures.length} bars but the first track has ${bars.length}: every track covers the whole song.` });
    }
  }
  if (!meta.title) errors.push({ line: 1, column: 1, message: 'The song needs a title.', expected: 'a header line "title: ..."' });
  if (errors.length) return { song: null, errors: errors.sort((a, b) => a.line - b.line || a.column - b.column), warnings };

  for (const t of tracks) {
    if (!t.roleSet) {
      const beatsAll = t.track.measures.flatMap((m) => m.beats);
      const onlySlashes = beatsAll.some((b) => b.slash) && beatsAll.every((b) => b.slash || b.notes.length === 0);
      t.track.role = onlySlashes ? 'rhythm' : t.tuning.length === 4 && t.tuning[0] < 35 ? 'bass' : 'lead';
    }
  }
  if (!tempo.length) {
    tempo.push({ bar: 0, bpm: 100 });
    warnAt(1, 1, 'No tempo given; using 100.');
  }
  tempo.sort((a, b) => a.bar - b.bar);
  // A header tempo and a body "tempo:" before the first bar: the later one wins.
  for (let i = tempo.length - 2; i >= 0; i--) if (tempo[i].bar === tempo[i + 1].bar) tempo.splice(i, 1);
  chords.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  annotations.sort((a, b) => a.bar - b.bar || a.tick - b.tick);
  const song: Song = {
    meta: { ...meta, id: meta.id ?? opts.id ?? slugify(meta.title!), title: meta.title! },
    tuning: songTuning,
    capo: songCapo,
    ...(key ? { key } : {}),
    tempo,
    bars,
    sections,
    tracks: tracks.map((t) => t.track),
    chords,
    annotations,
  };
  // Whatever the parser does not check itself (tuning ranges, sections) the validator does; point its findings at the bar's line.
  for (const issue of validateSong(song, { notation: false })) {
    const t = tracks.find((x) => x.track.id === issue.track) ?? tracks[0];
    const at = issue.bar !== undefined ? t.barLines[issue.bar] : undefined;
    const entry = { line: at?.line ?? 1, column: at?.col ?? 1, message: issue.message };
    if (issue.level === 'error') errors.push(entry);
    else warnings.push(entry);
  }
  if (errors.length) return { song: null, errors, warnings };
  return { song, errors, warnings };
}

function durationValue(m: RegExpExecArray): NoteValue {
  const base = m[1] ? DURATION_LETTERS[m[1]] : Number(m[2]);
  const dots = m[3].length;
  const value: NoteValue = { base, ...(dots ? { dots } : {}) };
  if (m[4]) {
    const actual = Number(m[4]);
    value.tuplet = { actual, normal: tupletNormal(actual) };
  }
  return value;
}

function barKind(text: string): { start: boolean; end: boolean; double: boolean; times: number } {
  const times = /x(\d+)$/.exec(text);
  const core = text.replace(/x\d+$/, '');
  return {
    start: /\|:$/.test(core),
    end: core.startsWith(':'),
    double: core === '||' || core === '|.' || core === '||.',
    times: times ? Number(times[1]) : 2,
  };
}

/** Remove `//` comments (outside quotes) and whole-line `#` comments. */
function stripComment(line: string): string {
  if (/^\s*#/.test(line)) return '';
  let inQuote = false;
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    if (!inQuote && line[i] === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

const BAR_RE = /^(?::?\|{1,2}(?::|\.)?|:\|\|?:?)(?:x(\d+))?/;

/** Split a music line into tokens; null when it cannot be tokenized at all. */
function tokenizeMusic(content: string, line: number, fail: (line: number, col: number, message: string, expected?: string, found?: string) => void): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const n = content.length;
  const isSpace = (c: string) => c === ' ' || c === '\t';
  const readMods = (): Token | undefined => {
    if (content[i] !== '{') return undefined;
    const end = content.indexOf('}', i);
    if (end < 0) {
      fail(line, i + 1, 'Modifiers opened with "{" are not closed.', '}');
      i = n;
      return undefined;
    }
    const tok: Token = { kind: 'mods', text: content.slice(i, end + 1), col: i + 1, line };
    i = end + 1;
    return tok;
  };
  const readWord = (): Token => {
    const start = i;
    let depth = 0;
    while (i < n) {
      const c = content[i];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && (isSpace(c) || c === '|' || c === '{' || c === '"' || (c === ':' && content[i + 1] === '|'))) break;
      i++;
    }
    const tok: Token = { kind: 'word', text: content.slice(start, i), col: start + 1, line };
    tok.mods = readMods();
    return tok;
  };
  while (i < n) {
    const c = content[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    if (c === '{') {
      fail(line, i + 1, 'Modifiers must follow a note or chord directly, with no space: 3:5{pm}.', 'a note right before "{"');
      readMods();
      continue;
    }
    if (c === '|' || (c === ':' && content[i + 1] === '|')) {
      const m = BAR_RE.exec(content.slice(i));
      if (!m) {
        fail(line, i + 1, 'Unreadable bar line.', '| || |: :| :|x3 or :|:', content.slice(i, i + 4));
        i++;
        continue;
      }
      tokens.push({ kind: 'bar', text: m[0], col: i + 1, line });
      i += m[0].length;
      continue;
    }
    if (c === '"' || (c === '^' && content[i + 1] === '"')) {
      const open = c === '^' ? i + 1 : i;
      const end = content.indexOf('"', open + 1);
      if (end < 0) {
        fail(line, i + 1, 'Quoted text is not closed.', 'a closing "');
        return tokens;
      }
      tokens.push({ kind: c === '^' ? 'annotation' : 'chord', text: content.slice(open + 1, end), col: i + 1, line });
      i = end + 1;
      continue;
    }
    if (c === '[') {
      const m = /^\[(\d+(?:,\d+)*)\]/.exec(content.slice(i));
      if (!m) {
        fail(line, i + 1, 'Unreadable ending number.', '[1], [2] or [1,2] at the start of a bar', content.slice(i, i + 6));
        i++;
        continue;
      }
      tokens.push({ kind: 'ending', text: m[0], col: i + 1, line });
      i += m[0].length;
      continue;
    }
    if (c === '%') {
      tokens.push({ kind: 'repeat-bar', text: '%', col: i + 1, line });
      i++;
      continue;
    }
    if (c === '(') {
      const start = i;
      let depth = 0;
      let end = -1;
      for (let j = i; j < n; j++) {
        if (content[j] === '(') depth++;
        else if (content[j] === ')') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end < 0) {
        fail(line, i + 1, 'A chord group opened with "(" is not closed.', ')');
        return tokens;
      }
      const inner: Token[] = [];
      i = start + 1;
      while (i < end) {
        if (isSpace(content[i])) {
          i++;
          continue;
        }
        const w = readWordUntil(end);
        inner.push(w);
      }
      i = end + 1;
      const group: Token = { kind: 'group', text: content.slice(start, end + 1), col: start + 1, inner, line };
      group.mods = readMods();
      tokens.push(group);
      continue;
    }
    const word = readWord();
    if (!word.text) {
      // A character no token can start with (a stray ")"): report it and move on, never loop.
      fail(line, i + 1, `Unexpected "${content[i]}".`, 'a note, a chord group (…), a rest, a slash, a duration or a bar line', content[i]);
      i++;
      continue;
    }
    tokens.push(word);
  }
  return tokens;

  function readWordUntil(limit: number): Token {
    const start = i;
    let depth = 0;
    while (i < limit) {
      const c = content[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (depth === 0 && (isSpace(c) || c === '{')) break;
      i++;
    }
    const tok: Token = { kind: 'word', text: content.slice(start, i), col: start + 1, line };
    if (content[i] === '{') {
      const end = content.indexOf('}', i);
      if (end < 0 || end > limit) {
        fail(line, i + 1, 'Modifiers opened with "{" are not closed.', '}');
        i = limit;
      } else {
        tok.mods = { kind: 'mods', text: content.slice(i, end + 1), col: i + 1, line };
        i = end + 1;
      }
    }
    return tok;
  }
}
