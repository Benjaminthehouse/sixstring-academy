/**
 * The correction panel under the music: what is selected and why it may be wrong, the fret (or
 * pitch), the string, the note length, the other readings the reader considered as one-tap fixes,
 * and how the bar adds up, with the fixes for a bar that does not.
 */
import { Button, Icon, IconButton, SegmentedControl, Stepper, Text, cx } from '@/ui';
import { NoteGlyph } from '@/ui/music';
import { valueTicks, type NoteValue } from '@/core/song';
import { midiToNote } from '@/core/theory';
import { type Draft, GUESS, checkBar, valueName } from '../model/draft';
import type { Selection } from '../model/select';
import styles from './Inspector.module.css';

/** Which part of the panel a phone shows. */
export type InspectorTab = 'note' | 'string' | 'length' | 'bar';

/** What the inspector can ask for. */
export interface InspectorActions {
  setFret(fret: number): void;
  setString(string: number): void;
  setValue(value: NoteValue): void;
  stepPitch(by: number): void;
  deleteNote(): void;
  deleteBeat(): void;
  confirm(): void;
  addNote(string: number, fret: number): void;
  insertBeat(): void;
  fitBar(): void;
  evenBar(): void;
  splitBar(): void;
  select(sel: Selection): void;
}

const LENGTHS: { base: number; id: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'; name: string; key: string }[] = [
  { base: 1, id: 'whole', name: 'Whole', key: 'W' },
  { base: 2, id: 'half', name: 'Half', key: 'H' },
  { base: 4, id: 'quarter', name: 'Quarter', key: 'Q' },
  { base: 8, id: 'eighth', name: 'Eighth', key: 'E' },
  { base: 16, id: 'sixteenth', name: 'Sixteenth', key: 'S' },
];

const STRING_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Letter of an open string ("e" for the top E, as tab writes it). */
function stringLetter(midi: number, string: number, strings: number): string {
  const n = STRING_NAMES[((midi % 12) + 12) % 12];
  return string === 1 && strings >= 6 ? n.toLowerCase() : n;
}

/** The inspector. */
export function Inspector({ draft, sel, actions, notationOnly, compact, tab = 'note', onTab = () => undefined }: { draft: Draft; sel: Selection | null; actions: InspectorActions; notationOnly: boolean; compact: boolean; tab?: InspectorTab; onTab?: (t: InspectorTab) => void }) {
  if (!sel) {
    return (
      <div className={styles.root} data-scan-inspector="none">
        <Text tone="muted">Tap a note on the tab or on your picture to check it.</Text>
      </div>
    );
  }
  const song = draft.song;
  const strings = song.tuning.length;
  const bar = sel.bar;
  const check = checkBar(song, bar);
  const beats = song.tracks[0].measures[bar]?.beats ?? [];
  const beat = sel.beat !== null ? beats[sel.beat] : undefined;
  const bm = sel.beat !== null ? draft.marks[bar]?.beats[sel.beat] : undefined;
  const note = beat && sel.note !== null ? beat.notes[sel.note] : undefined;
  const nm = bm && sel.note !== null ? bm.notes[sel.note] : undefined;
  const doubtful = !!nm && !nm.checked && nm.confidence < GUESS;
  const rhythmDoubt = !!bm && !bm.checked && bm.confidence < GUESS && !draft.marks[bar]?.estimated;
  const string = note?.string ?? sel.string ?? 1;
  const openMidi = (s: number) => song.tuning[strings - s] + song.capo;
  const value: NoteValue | undefined = beat ? beat.value ?? undefined : undefined;
  const base = value?.base;
  const dots = value?.dots ?? 0;

  const where = sel.beat === null ? `Bar ${bar + 1}` : `Bar ${bar + 1} · ${beat?.notes.length ? (beat.notes.length > 1 ? 'chord' : 'note') : 'rest'} ${sel.beat + 1}`;
  const alts = nm ? (notationOnly ? nm.altMidis.slice(0, 3) : nm.altFrets.slice(0, 3)) : [];

  const barLine = (
    <div className={cx(styles.barLine, check.ok ? styles.barOk : styles.barBad)} data-scan-bar-check={check.ok ? 'ok' : 'bad'}>
      <Icon name={check.ok ? 'CircleCheck' : 'TriangleAlert'} size="sm" />
      <span>
        Bar {bar + 1}: {check.ok ? 'adds up' : check.text.charAt(0).toLowerCase() + check.text.slice(1)}
      </span>
      {!check.ok && (
        <span className={styles.barFixes}>
          {check.diff >= check.need && (
            <Button size="sm" variant="primary" iconLeft="Scissors" onClick={actions.splitBar} data-scan-split="">
              Split into bars
            </Button>
          )}
          <Button size="sm" onClick={actions.fitBar} data-scan-fit="">
            {check.diff < 0 ? 'Fill with a rest' : 'Cut at the bar line'}
          </Button>
          {check.diff < check.need && (
            <Button size="sm" variant="ghost" onClick={actions.evenBar}>
              Even out
            </Button>
          )}
        </span>
      )}
    </div>
  );

  // A whole bar selected: its rhythm.
  if (sel.beat === null || !beat) {
    return (
      <div className={styles.root} data-scan-inspector="bar">
        <div className={styles.head}>
          <span className={styles.where}>{where}</span>
          <Text size="sm" tone="muted">
            {beats.length} {beats.length === 1 ? 'beat' : 'beats'}: {beats.map((b) => valueName(b.value, b.duration)).join(', ') || 'empty'}
          </Text>
        </div>
        {barLine}
        <div className={styles.row}>
          <Button size="sm" iconLeft="MousePointerClick" onClick={() => actions.select({ bar, beat: 0, note: beats[0]?.notes.length ? 0 : null, string: beats[0]?.notes[0]?.string ?? 1 })} disabled={!beats.length}>
            Check its notes
          </Button>
        </div>
      </div>
    );
  }

  const fretControl = note ? (
    notationOnly ? (
      <div className={styles.pitch}>
        <span className={styles.fieldLabel}>Pitch</span>
        <div className={styles.pitchRow}>
          <IconButton icon="Minus" label="A semitone lower" variant="secondary" onClick={() => actions.stepPitch(-1)} />
          <span className={styles.pitchValue} aria-live="polite">
            {midiToNote(note.midi)}
          </span>
          <IconButton icon="Plus" label="A semitone higher" variant="secondary" onClick={() => actions.stepPitch(1)} />
        </div>
        <Text size="xs" tone="muted">
          String {note.string}, fret {note.fret}
        </Text>
      </div>
    ) : (
      <Stepper label="Fret" hideLabel={compact} value={note.fret} min={0} max={24} onChange={actions.setFret} size={compact ? 'md' : 'lg'} format={(v) => (v === 0 ? 'open string' : `fret ${v}`)} className={styles.fret} />
    )
  ) : (
    <div className={styles.addHere}>
      <span className={styles.fieldLabel}>String {string} is empty here</span>
      <div className={styles.addRow}>
        {[0, 1, 2, 3, 5, 7].map((f) => (
          <button key={f} type="button" className={styles.fretChip} onClick={() => actions.addNote(string, f)} aria-label={`Add fret ${f} on string ${string}`}>
            {f}
          </button>
        ))}
      </div>
      <Text size="xs" tone="muted">
        Or type a fret number.
      </Text>
    </div>
  );

  const altsBlock =
    alts.length > 0 && note ? (
      <div className={styles.alts}>
        <span className={styles.fieldLabel}>Or maybe</span>
        <div className={styles.altRow}>
          {alts.map((a) => (
            <button key={a} type="button" className={styles.altChip} onClick={() => (notationOnly ? actions.stepPitch(a - note.midi) : actions.setFret(a))} data-scan-alt={a}>
              {notationOnly ? midiToNote(a) : a}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  const stringsBlock = (
    <div className={styles.strings} role="radiogroup" aria-label="String">
      <span className={styles.fieldLabel} aria-hidden="true">
        String
      </span>
      <div className={styles.stringRow}>
        {Array.from({ length: strings }, (_, i) => i + 1).map((s) => {
          const used = beat.notes.some((n) => n.string === s);
          const at = beat.notes.findIndex((n) => n.string === s);
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === string}
              aria-label={`String ${s} (${stringLetter(openMidi(s), s, strings)})${used && s !== string ? ', has a note' : ''}`}
              className={cx(styles.stringChip, s === string && styles.on, used && styles.used)}
              onClick={() => (note ? actions.setString(s) : actions.select({ bar, beat: sel.beat, note: at >= 0 ? at : null, string: s }))}
            >
              {stringLetter(openMidi(s), s, strings)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const lengthsBlock = (
    <div className={styles.lengths} role="radiogroup" aria-label="Note length">
      <span className={styles.fieldLabel} aria-hidden="true">
        Length
      </span>
      <div className={styles.lengthRow}>
        {LENGTHS.map((l) => (
          <button
            key={l.base}
            type="button"
            role="radio"
            aria-checked={base === l.base}
            aria-label={`${l.name}${base === l.base && dots ? ', dotted' : ''} (key ${l.key})`}
            className={cx(styles.lengthChip, base === l.base && styles.on, rhythmDoubt && base === l.base && styles.doubtChip)}
            onClick={() => actions.setValue({ base: l.base, ...(base === l.base && dots ? { dots } : {}) })}
          >
            <NoteGlyph value={l.id} rest={!beat.notes.length} />
          </button>
        ))}
        <button
          type="button"
          aria-pressed={dots > 0}
          aria-label="Dotted (key .)"
          className={cx(styles.lengthChip, dots > 0 && styles.on)}
          onClick={() => base && actions.setValue({ base, ...(dots ? {} : { dots: 1 }), ...(value?.tuplet ? { tuplet: value.tuplet } : {}) })}
          disabled={!base}
        >
          <span className={styles.dot} aria-hidden="true" />
        </button>
      </div>
      {rhythmDoubt && bm && bm.altValues.length > 0 && (
        <Text size="xs" tone="muted">
          Or maybe {bm.altValues.slice(0, 2).map((v) => valueName(v, valueTicks(v))).join(' or ')}
        </Text>
      )}
    </div>
  );

  const actionsBlock = (
    <div className={styles.actions}>
      {note && <IconButton icon="Trash2" label="Remove this note (Delete)" variant="secondary" onClick={actions.deleteNote} data-scan-delete="" />}
      <IconButton icon="Eraser" label="Remove the whole beat (Shift+Delete)" variant="secondary" onClick={actions.deleteBeat} />
      <IconButton icon="Plus" label="Add a beat after this one" variant="secondary" onClick={actions.insertBeat} />
    </div>
  );

  const header = (
    <div className={styles.head}>
      <span className={styles.where}>{where}</span>
      {note && (
        <span className={styles.what}>
          {notationOnly ? `${midiToNote(note.midi)} on string ${note.string}` : `string ${note.string}, fret ${note.fret}`}
          {nm?.source === 'ai' ? ' (from the AI)' : ''}
        </span>
      )}
      {(doubtful || rhythmDoubt) && !compact && (
        <span className={styles.doubt} data-scan-doubt="">
          <Icon name="CircleHelp" size="sm" />
          <span>{doubtful ? nm?.reasons[0] ?? 'The reader was not sure about this one.' : bm?.reasons[0] ?? 'The reader was not sure how long this lasts.'}</span>
        </span>
      )}
      {(doubtful || rhythmDoubt) && (
        <Button size="sm" variant="secondary" iconLeft="Check" onClick={actions.confirm} data-scan-confirm="" className={styles.right}>
          It’s right
        </Button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={cx(styles.root, styles.compact)} data-scan-inspector="note">
        {header}
        {(doubtful || rhythmDoubt) && (
          <span className={styles.doubt} data-scan-doubt="">
            <Icon name="CircleHelp" size="sm" />
            <span>{doubtful ? nm?.reasons[0] ?? 'The reader was not sure about this one.' : bm?.reasons[0] ?? 'The reader was not sure how long this lasts.'}</span>
          </span>
        )}
        <SegmentedControl
          aria-label="What to change"
          size="sm"
          fullWidth
          options={[
            { value: 'note', label: notationOnly ? 'Pitch' : 'Fret' },
            { value: 'string', label: 'String' },
            { value: 'length', label: 'Length' },
            { value: 'bar', label: check.ok ? 'Bar' : 'Bar !' },
          ]}
          value={tab}
          onChange={(v) => onTab(v as InspectorTab)}
        />
        <div className={styles.compactRow}>
          {tab === 'note' && (
            <>
              {fretControl}
              {altsBlock}
              {actionsBlock}
            </>
          )}
          {tab === 'string' && stringsBlock}
          {tab === 'length' && lengthsBlock}
          {tab === 'bar' && barLine}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-scan-inspector="note">
      {header}
      <div className={styles.controls}>
        {fretControl}
        {altsBlock}
        {stringsBlock}
        {lengthsBlock}
        {actionsBlock}
      </div>
      {barLine}
    </div>
  );
}
