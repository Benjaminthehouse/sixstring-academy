import { useEffect, useMemo, useState } from 'react';
import { identifyTuning, type Instrument, type Tuning } from '@/core/guitar';
import { midiToNote } from '@/core/theory';
import { Banner, Button, EmptyState, Icon, IconButton, List, ListItem, SearchField, Sheet, Stepper, Tag, Text, TextField, useIsTouch } from '@/ui';
import {
  CUSTOM_MAX_STRINGS,
  CUSTOM_MIDI_MAX,
  CUSTOM_MIDI_MIN,
  CUSTOM_MIN_STRINGS,
  makeCustomTuning,
  resizeStrings,
  retunePlan,
  tuningGroups,
  type SavedTuning,
} from '../model/catalog';
import { noteParts, type NoteNaming } from '../model/targets';
import styles from './TuningSheet.module.css';

/** Props for `<TuningSheet>`. */
export interface TuningSheetProps {
  open: boolean;
  onClose: () => void;
  /** The tuning in use. */
  tuning: Tuning;
  saved: readonly SavedTuning[];
  naming: NoteNaming;
  /** Use a tuning (a catalog one, or one of the learner's own). */
  onSelect: (tuning: Tuning) => void;
  /** Keep a new custom tuning and use it. */
  onSave: (saved: SavedTuning, tuning: Tuning) => void;
  /** Forget one of the learner's own tunings. */
  onDelete: (id: string) => void;
  /** Play a note so the learner can hear what a string will be. */
  onAudition: (midi: number) => void;
}

function labelOf(tuning: Tuning, naming: NoteNaming): string {
  return tuning.notes.map((n) => noteParts(n, naming).short).join(' ');
}

/** How a tuning is reached from the usual one, as a short list. */
export function RetuneSteps({ tuning, naming }: { tuning: Tuning; naming: NoteNaming }) {
  const plan = useMemo(() => retunePlan(tuning, naming), [tuning, naming]);
  if (!plan) return null;
  return (
    <div className={styles.plan}>
      <p className={styles.planTitle}>
        From {plan.from.toLowerCase()} tuning: {plan.lines.length} of {plan.strings} strings change
      </p>
      <ol className={styles.planList}>
        {plan.lines.map((line) => (
          <li key={line.index} className={styles.planLine}>
            <Icon name={line.semitones < 0 ? 'ArrowDown' : 'ArrowUp'} size="sm" />
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
      {plan.raises && <p className={styles.planNote}>Tune up slowly: a raised string is under more tension than it is used to.</p>}
    </div>
  );
}

/**
 * The tuning picker: every catalog tuning, grouped and searchable, the learner's own tunings, and
 * an editor for a new one. A bottom sheet on phones, a side panel on wide screens.
 */
export function TuningSheet({ open, onClose, tuning, saved, naming, onSelect, onSave, onDelete, onAudition }: TuningSheetProps) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [strings, setStrings] = useState<number[]>(() => [...tuning.midi]);
  const [name, setName] = useState('');
  const touch = useIsTouch();

  // Every opening starts at the list, with the editor loaded from the tuning in use.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setEditing(false);
    setStrings([...tuning.midi]);
    setName('');
  }, [open, tuning]);

  const groups = useMemo(() => tuningGroups(query, saved), [query, saved]);
  const isSaved = saved.some((s) => s.id === tuning.id);
  const preferFlats = tuning.notes.some((n) => n.includes('b'));
  const instrument: Instrument = tuning.instrument;
  const known = editing ? identifyTuning(strings) : null;

  const choose = (t: Tuning): void => {
    onSelect(t);
    onClose();
  };

  const useCustom = (): void => {
    const result = makeCustomTuning(strings, name, instrument);
    if (!result) return;
    if (result.saved) onSave(result.saved, result.tuning);
    else onSelect(result.tuning);
    onClose();
  };

  const setString = (index: number, midi: number): void => {
    const next = Math.min(CUSTOM_MIDI_MAX, Math.max(CUSTOM_MIDI_MIN, midi));
    setStrings((prev) => prev.map((m, i) => (i === index ? next : m)));
    onAudition(next);
  };

  if (editing) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Your own tuning"
        description="Set the note of each string, thickest first."
        desktop="drawer"
        footer={
          <>
            <Button onClick={() => setEditing(false)}>Back to the list</Button>
            <Button variant="primary" onClick={useCustom}>
              Use this tuning
            </Button>
          </>
        }
      >
        <div className={styles.editor}>
          <Stepper label="Number of strings" min={CUSTOM_MIN_STRINGS} max={CUSTOM_MAX_STRINGS} value={strings.length} onChange={(n) => setStrings((prev) => resizeStrings(prev, n))} editable={false} />
          <ul className={styles.rows} role="list">
            {strings.map((midi, index) => {
              const note = midiToNote(midi, { prefer: preferFlats ? 'flats' : 'sharps' });
              const parts = noteParts(note, naming);
              const number = strings.length - index;
              return (
                <li key={`${strings.length}-${index}`} className={styles.row}>
                  <span className={styles.rowLabel}>String {number}</span>
                  <IconButton icon="Minus" label={`String ${number}: one fret lower`} variant="secondary" disabled={midi <= CUSTOM_MIDI_MIN} onClick={() => setString(index, midi - 1)} />
                  <button type="button" className={styles.rowNote} aria-label={`String ${number} is ${parts.text}. Play it`} onClick={() => onAudition(midi)}>
                    <span className={styles.rowNoteName}>{parts.short}</span>
                    <span className={styles.rowNoteOctave}>{parts.octave}</span>
                  </button>
                  <IconButton icon="Plus" label={`String ${number}: one fret higher`} variant="secondary" disabled={midi >= CUSTOM_MIDI_MAX} onClick={() => setString(index, midi + 1)} />
                </li>
              );
            })}
          </ul>
          {known ? (
            <Banner tone="info" icon="Info">
              These strings are {known.name}. It will be chosen from the list.
            </Banner>
          ) : (
            <TextField label="Name" optional value={name} onChange={setName} maxLength={40} placeholder={strings.map((m) => noteParts(midiToNote(m, { prefer: preferFlats ? 'flats' : 'sharps' }), naming).short).join(' ')} hint="Shown in your tunings. Leave empty to use the notes." />
          )}
          <Text variant="caption" tone="muted">
            Each press moves the string by one fret. Tap a note to hear it. Strings far above their usual pitch can snap: go up in small steps.
          </Text>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Tuning" description="What each open string should sound like." desktop="drawer" flush>
      <div className={styles.picker}>
        <div className={styles.search}>
          <SearchField value={query} onChange={setQuery} label="Search tunings" placeholder="Search: drop d, open g, bass…" {...(touch ? {} : { 'data-autofocus': true })} />
        </div>

        {!query && (
          <section className={styles.current} aria-label="Tuning in use">
            <p className={styles.currentKicker}>In use</p>
            <p className={styles.currentName}>{tuning.name}</p>
            <p className={styles.currentNotes}>{labelOf(tuning, naming)}</p>
            <p className={styles.currentText}>{tuning.description}</p>
            <RetuneSteps tuning={tuning} naming={naming} />
            {isSaved && (
              <div className={styles.currentActions}>
                <Button size="sm" variant="ghost" iconLeft="Trash2" onClick={() => onDelete(tuning.id)}>
                  Remove from your tunings
                </Button>
              </div>
            )}
          </section>
        )}

        {groups.length === 0 ? (
          <div className={styles.empty}>
            <EmptyState
              icon="Search"
              title={`No tuning matches “${query}”`}
              actions={
                <Button variant="primary" iconLeft="Plus" onClick={() => setEditing(true)}>
                  Make your own tuning
                </Button>
              }
            >
              Try the name (“drop d”), the notes (“dadgad”) or the instrument (“bass”).
            </EmptyState>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.id} className={styles.group} aria-label={group.title}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              {group.hint && <p className={styles.groupHint}>{group.hint}</p>}
              <List variant="card">
                {group.tunings.map((t) => (
                  <ListItem
                    key={t.id}
                    title={t.name}
                    subtitle={<span className={styles.itemNotes}>{labelOf(t, naming)}</span>}
                    selected={t.id === tuning.id}
                    trailing={t.id === tuning.id ? <Icon name="Check" size="sm" label="In use" /> : t.stringCount !== 6 ? <Tag>{t.stringCount} strings</Tag> : undefined}
                    onClick={() => choose(t)}
                  />
                ))}
              </List>
            </section>
          ))
        )}

        {groups.length > 0 && (
          <div className={styles.own}>
            <Button iconLeft="Plus" fullWidth onClick={() => setEditing(true)}>
              Make your own tuning
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
