/**
 * Song validation: every bar exactly full, every pitch consistent with its string, fret, tuning
 * and capo, connected techniques connected to something, timeline lists inside the song.
 * Messages are written for the author who has to fix them: bar numbers are 1-based, and the
 * message says what is wrong and what would make it right.
 */
import { chordPcs, isNoChord, midiToNote, parseChord } from '@/core/theory';
import { MAX_FRET, barCapacity, barLength, formatTimeSig, midiOf, trackCapo, trackTuning, valueFromTicks, valueTicks } from './model';
import type { Note, Song, SongIssue, Track } from './types';

const VALUE_NAMES: Record<number, string> = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: 'thirty-second', 64: 'sixty-fourth' };

/** A tick length in words: `an eighth`, `a dotted quarter`, `1200 ticks`. */
export function describeTicks(ticks: number): string {
  const v = valueFromTicks(Math.abs(ticks));
  if (!v) return `${Math.abs(ticks)} ticks`;
  const name = `${v.dots === 2 ? 'double-dotted ' : v.dots ? 'dotted ' : ''}${v.tuplet ? `${v.tuplet.actual}-tuplet ` : ''}${VALUE_NAMES[v.base] ?? `1/${v.base}`}`;
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/** A pitch for messages: `C4 (60)`. */
function pitchName(midi: number): string {
  return Number.isFinite(midi) ? `${midiToNote(Math.round(midi))} (${midi})` : String(midi);
}

/** Options for `validateSong`. */
export interface ValidateOptions {
  /** Also report notation details (written values that disagree with durations). Default true. */
  notation?: boolean;
}

/** Every problem in a song, errors first. An empty list means the song is valid. */
export function validateSong(song: Song, opts: ValidateOptions = {}): SongIssue[] {
  const issues: SongIssue[] = [];
  const err = (code: string, message: string, extra: Partial<SongIssue> = {}) => issues.push({ level: 'error', code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<SongIssue> = {}) => issues.push({ level: 'warning', code, message, ...extra });

  if (!song.meta?.title?.trim()) err('meta-title', 'The song has no title.');
  if (!song.meta?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(song.meta.id)) err('meta-id', `Song id "${song.meta?.id ?? ''}" must be lowercase letters, digits and single hyphens.`);
  if (song.meta?.difficulty !== undefined && !(song.meta.difficulty >= 1 && song.meta.difficulty <= 10)) err('meta-difficulty', `Difficulty ${song.meta.difficulty} is outside 1–10.`);

  checkTuning(song.tuning, 'The song', err);
  if (!Number.isInteger(song.capo) || song.capo < 0 || song.capo > 12) err('capo', `Capo ${song.capo} must be a whole fret from 0 to 12.`);

  const barCount = song.bars.length;
  if (!barCount) err('no-bars', 'The song has no bars.');
  song.bars.forEach((info, bar) => {
    const t = info.time;
    if (!t || !Number.isInteger(t.numerator) || t.numerator < 1 || ![1, 2, 4, 8, 16, 32].includes(t.denominator)) {
      err('time-signature', `Bar ${bar + 1} has an invalid time signature ${t ? formatTimeSig(t) : '(none)'}.`, { bar });
      return;
    }
    if (info.length !== undefined) {
      const cap = barCapacity(t);
      if (!(info.length > 0) || info.length > cap) err('bar-length', `Bar ${bar + 1} is marked as a ${info.length}-tick pickup, but a pickup must be shorter than the ${cap} ticks of ${formatTimeSig(t)}.`, { bar });
      else if (bar !== 0 && bar !== barCount - 1) warn('short-bar', `Bar ${bar + 1} is shorter than its time signature but is neither the first (pickup) nor the last bar.`, { bar });
    }
    if (info.repeatEnd !== undefined && (!Number.isInteger(info.repeatEnd) || info.repeatEnd < 2)) err('repeat', `Bar ${bar + 1} ends a repeat played ${info.repeatEnd} times; it must be played at least twice.`, { bar });
    if (info.ending && (!info.ending.length || info.ending.some((n) => !Number.isInteger(n) || n < 1))) err('ending', `Bar ${bar + 1} has invalid ending numbers ${JSON.stringify(info.ending)}.`, { bar });
  });
  checkRepeats(song, err);

  if (!song.tempo?.length) err('tempo', 'The song has no tempo.');
  song.tempo?.forEach((t, i) => {
    if (!(t.bpm >= 10 && t.bpm <= 500)) err('tempo', `Tempo ${t.bpm} (change ${i + 1}) must be between 10 and 500 quarter notes per minute.`, { bar: t.bar });
    if (t.bar < 0 || t.bar >= barCount) err('tempo', `Tempo change ${i + 1} is at bar ${t.bar + 1}, outside the song's ${barCount} bars.`, { bar: t.bar });
  });
  if (song.tempo?.length && (song.tempo[0].bar !== 0 || (song.tempo[0].tick ?? 0) !== 0)) warn('tempo-start', 'The first tempo is not at the start of the song; playback uses it from the start anyway.');

  let lastSectionEnd = 0;
  song.sections.forEach((s) => {
    if (!s.name.trim()) err('section', `A section at bar ${s.start + 1} has no name.`, { bar: s.start });
    if (!(s.start >= 0 && s.end > s.start && s.end <= barCount)) err('section', `Section "${s.name}" covers bars ${s.start + 1}–${s.end}, which is not inside the song's ${barCount} bars.`, { bar: s.start });
    if (s.start < lastSectionEnd) warn('section-overlap', `Section "${s.name}" starts at bar ${s.start + 1}, inside the previous section.`, { bar: s.start });
    lastSectionEnd = Math.max(lastSectionEnd, s.end);
    if (s.strum && !/^[DUXdux.\-]+$/.test(s.strum.pattern)) err('strum', `Strum pattern "${s.strum.pattern}" in "${s.name}" may only use D, U, X, - and .`, { bar: s.start });
  });

  if (!song.tracks.length) err('no-tracks', 'The song has no tracks.');
  const ids = new Set<string>();
  for (const track of song.tracks) {
    if (ids.has(track.id)) err('track-id', `Two tracks share the id "${track.id}".`, { track: track.id });
    ids.add(track.id);
    if (track.tuning) checkTuning(track.tuning, `Track "${track.name}"`, err);
    if (track.measures.length !== barCount) {
      err('track-bars', `Track "${track.name}" has ${track.measures.length} bars but the song has ${barCount}.`, { track: track.id });
    }
    validateTrack(song, track, err, warn, opts.notation !== false);
  }

  song.chords.forEach((c) => {
    if (!inSong(song, c.bar, c.tick)) err('chord-position', `Chord "${c.symbol}" is placed at bar ${c.bar + 1}, tick ${c.tick}, outside the song.`, { bar: c.bar });
    if (!isNoChord(c.symbol) && !parseChord(c.symbol)) err('chord-symbol', `"${c.symbol}" at bar ${c.bar + 1} is not a chord symbol the app can read (try C, Am7, F#m7b5, G/B).`, { bar: c.bar });
    if (c.voicing && c.voicing.length !== song.tuning.length) err('chord-voicing', `The shape for "${c.symbol}" at bar ${c.bar + 1} lists ${c.voicing.length} strings; the tuning has ${song.tuning.length}.`, { bar: c.bar });
    else if (c.voicing && !isNoChord(c.symbol) && parseChord(c.symbol)) {
      // The shape must sound the chord (with the capo): catches a capo shape written where the sounding chord belongs.
      const want = new Set(chordPcs(c.symbol));
      const sounding = c.voicing.flatMap((f, i) => (f === null ? [] : [(((song.tuning[i] + song.capo + f) % 12) + 12) % 12]));
      if (sounding.some((pc) => !want.has(pc))) {
        warn('chord-voicing-mismatch', `The shape ${c.voicing.map((f) => (f === null ? 'x' : f)).join('')} at bar ${c.bar + 1} does not sound ${c.symbol}${song.capo ? ` with capo ${song.capo} (chord symbols name what sounds: the shape name is for display)` : ''}.`, { bar: c.bar });
      }
    }
  });
  song.annotations.forEach((a) => {
    if (!inSong(song, a.bar, a.tick)) err('annotation-position', `Annotation "${a.text}" is placed outside the song (bar ${a.bar + 1}).`, { bar: a.bar });
  });

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

/** True when the song has no errors (warnings allowed). */
export function isValidSong(song: Song): boolean {
  return !validateSong(song, { notation: false }).some((i) => i.level === 'error');
}

/** Throw a RangeError listing every error, for authored content that must be right. Returns the song. */
export function assertValidSong(song: Song): Song {
  const errors = validateSong(song, { notation: false }).filter((i) => i.level === 'error');
  if (errors.length) throw new RangeError(`"${song.meta?.title}" is not a valid song:\n- ${errors.map((e) => e.message).join('\n- ')}`);
  return song;
}

function inSong(song: Song, bar: number, tick: number): boolean {
  const info = song.bars[bar];
  return !!info && tick >= 0 && tick < barLength(info);
}

function checkTuning(tuning: readonly number[], who: string, err: (code: string, message: string) => void): void {
  if (!Array.isArray(tuning) || tuning.length < 1 || tuning.length > 12) err('tuning', `${who} has no usable tuning (one MIDI pitch per string, low to high).`);
  else if (tuning.some((m) => !Number.isInteger(m) || m < 12 || m > 96)) err('tuning', `${who} has a tuning with impossible pitches: ${tuning.join(' ')}.`);
}

function checkRepeats(song: Song, err: (code: string, message: string, extra?: Partial<SongIssue>) => void): void {
  let open = -1;
  song.bars.forEach((info, bar) => {
    if (info.repeatStart) {
      if (open >= 0) err('repeat', `Bar ${bar + 1} starts a repeat while the one from bar ${open + 1} is still open.`, { bar });
      open = bar;
    }
    if (info.repeatEnd !== undefined) open = -1;
  });
}

type Report = (code: string, message: string, extra?: Partial<SongIssue>) => void;

function validateTrack(song: Song, track: Track, err: Report, warn: Report, notation: boolean): void {
  const tuning = trackTuning(song, track);
  const capo = trackCapo(song, track);
  const strings = tuning.length;
  /** Last note struck or held on each string, across bars (cleared by a rest-free gap only when the string is restruck). */
  const lastOnString = new Map<number, Note | null>();
  track.measures.forEach((measure, bar) => {
    const info = song.bars[bar];
    if (!info) return;
    const where = (beat?: number) => `Bar ${bar + 1}${beat !== undefined ? `, beat ${beat + 1}` : ''} of "${track.name}"`;
    const need = barLength(info);
    let at = 0;
    measure.beats.forEach((beat, bi) => {
      const extra = { track: track.id, bar, beat: bi };
      if (!(beat.duration > 0) || !Number.isFinite(beat.duration)) err('beat-duration', `${where(bi)} has a duration of ${beat.duration} ticks; durations must be positive.`, extra);
      if (beat.start !== at) {
        if (beat.start > at) err('beat-gap', `${where(bi)} starts at tick ${beat.start}, leaving ${describeTicks(beat.start - at)} empty before it: add a rest.`, extra);
        else err('beat-overlap', `${where(bi)} starts at tick ${beat.start}, overlapping the previous beat by ${describeTicks(at - beat.start)}.`, extra);
      }
      at = beat.start + beat.duration;
      if (notation && beat.value && Math.abs(valueTicks(beat.value) - beat.duration) > 1e-6) {
        warn('beat-value', `${where(bi)} is written as ${beat.value.base}${'.'.repeat(beat.value.dots ?? 0)} but lasts ${beat.duration} ticks.`, extra);
      }
      if (beat.notes.length === 0) {
        // A rest ends whatever was ringing for the purpose of ties and legato.
        if (!beat.slash) lastOnString.clear();
        return;
      }
      const seen = new Set<number>();
      for (const note of beat.notes) checkNote(note, bi);
      for (const note of beat.notes) lastOnString.set(note.string, note);

      function checkNote(note: Note, beatIndex: number): void {
        if (!Number.isInteger(note.string) || note.string < 1 || note.string > strings) {
          err('note-string', `${where(beatIndex)} uses string ${note.string}; the tuning has strings 1–${strings}.`, extra);
          return;
        }
        if (seen.has(note.string)) err('note-duplicate-string', `${where(beatIndex)} has two notes on string ${note.string}; one string plays one note at a time.`, extra);
        seen.add(note.string);
        if (!Number.isInteger(note.fret) || note.fret < 0 || note.fret > MAX_FRET) {
          err('note-fret', `${where(beatIndex)}: fret ${note.fret} on string ${note.string} is not a fret (0–${MAX_FRET}).`, extra);
          return;
        }
        const expected = midiOf(note.string, note.fret, tuning, capo);
        if (note.midi !== expected) {
          err('pitch-mismatch', `${where(beatIndex)}: string ${note.string} fret ${note.fret} sounds ${pitchName(expected)}${capo ? ` with capo ${capo}` : ''}, but the note says ${pitchName(note.midi)}.`, extra);
        }
        const prev = lastOnString.get(note.string) ?? null;
        if (note.tie) {
          if (!prev) err('tie-orphan', `${where(beatIndex)}: the tie on string ${note.string} has no note before it to continue.`, extra);
          else if (prev.fret !== note.fret) err('tie-fret', `${where(beatIndex)}: string ${note.string} is tied from fret ${prev.fret} to fret ${note.fret}; a tie keeps the same fret (use a slide or a hammer-on to change it).`, extra);
        }
        if (note.legato || note.slide) {
          const what = note.legato === 'hammer' ? 'hammer-on' : note.legato === 'pull' ? 'pull-off' : 'slide';
          if (!prev) err('legato-orphan', `${where(beatIndex)}: the ${what} on string ${note.string} has no earlier note on that string to start from.`, extra);
          else if (prev.fret === note.fret) err('legato-same-fret', `${where(beatIndex)}: the ${what} on string ${note.string} goes from fret ${prev.fret} to the same fret.`, extra);
          else if (note.legato === 'hammer' && note.fret < prev.fret) warn('legato-direction', `${where(beatIndex)}: a hammer-on goes up, but string ${note.string} goes down from fret ${prev.fret} to ${note.fret} (a pull-off?).`, extra);
          else if (note.legato === 'pull' && note.fret > prev.fret) warn('legato-direction', `${where(beatIndex)}: a pull-off goes down, but string ${note.string} goes up from fret ${prev.fret} to ${note.fret} (a hammer-on?).`, extra);
          else if (note.slide && (note.slide === 'up') !== note.fret > prev.fret) warn('slide-direction', `${where(beatIndex)}: the slide on string ${note.string} is marked ${note.slide} but goes from fret ${prev.fret} to ${note.fret}.`, extra);
        }
        if (note.bend && !(note.bend.amount > 0 && note.bend.amount <= 5)) err('bend', `${where(beatIndex)}: a bend of ${note.bend.amount} semitones is not playable (use 0.5 to 4).`, extra);
        if (note.length !== undefined && !(note.length > 0)) err('note-length', `${where(beatIndex)}: note length ${note.length} must be positive.`, extra);
        if (note.finger !== undefined && ![0, 1, 2, 3, 4, 'T'].includes(note.finger)) err('finger', `${where(beatIndex)}: left-hand finger ${String(note.finger)} must be 0–4 or T.`, extra);
        if (note.pluck !== undefined && !['p', 'i', 'm', 'a', 'c'].includes(note.pluck)) err('pluck', `${where(beatIndex)}: right-hand finger ${String(note.pluck)} must be p, i, m, a or c.`, extra);
      }
    });
    if (at !== need) {
      const what = info.length !== undefined ? `this ${need}-tick pickup bar` : `${formatTimeSig(info.time)}`;
      if (at < need) err('bar-length', `${where()} holds ${at} ticks but ${what} needs ${need}: ${describeTicks(need - at)} is missing.`, { track: track.id, bar });
      else err('bar-length', `${where()} holds ${at} ticks but ${what} needs ${need}: ${describeTicks(at - need)} too much.`, { track: track.id, bar });
    }
  });
}
