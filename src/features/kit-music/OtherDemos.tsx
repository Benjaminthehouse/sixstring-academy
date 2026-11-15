import { useMemo, useState } from 'react';
import { chordVoicings } from '@/core/guitar';
import { diatonicChords, formatChord, formatKey, formatRoman, getKey } from '@/core/theory';
import { Button, useInterval } from '@/ui';
import {
  ChordDiagram,
  CircleOfFifths,
  DegreeLegend,
  IntervalBadge,
  NotationView,
  NoteBadge,
  PianoKeys,
  RhythmView,
  StrumPattern,
  TuningLabel,
  noteText,
  parseRhythm,
  parseStrum,
  rhythmGrid,
  useMusicSettings,
  type NotationItem,
  type PianoHighlight,
} from '@/ui/music';
import { Demo, Group, Shelf, ShelfItem, kitStyles as styles } from './parts';

// ── chord diagrams ──────────────────────────────────────────────────────────────────────────────

const OPEN_CHORDS = ['C', 'G', 'D', 'Em', 'Am', 'E7'];

/** Chord boxes in sizes and styles. */
export function ChordGroup() {
  const g = useMemo(() => chordVoicings('G')[0], []);
  const f = useMemo(() => chordVoicings('F')[0], []);
  const bm = useMemo(() => chordVoicings('Bm')[0], []);
  const d5 = useMemo(() => chordVoicings('D', { minFret: 5, allowOpen: false })[0], []);
  const cmaj7 = useMemo(() => chordVoicings('Cmaj7', { allowOpen: false, minFret: 7 })[0], []);
  return (
    <Group id="chords" index="02" title="Chord diagrams" blurb="The standard box from any voicing the engine knows: nut or base fret, fingers, barres, x and o, notes or degrees underneath.">
      <div className={styles.grid}>
        <Demo title="G major" note="From the engine's first voicing, in four sizes: a list chip up to a lesson figure.">
          <Shelf>
            <ShelfItem caption="xs">
              <ChordDiagram voicing={g} size="xs" />
            </ShelfItem>
            <ShelfItem caption="sm">
              <ChordDiagram voicing={g} size="sm" />
            </ShelfItem>
            <ShelfItem caption="md">
              <ChordDiagram voicing={g} />
            </ShelfItem>
            <ShelfItem caption="lg, notes under">
              <ChordDiagram voicing={g} size="lg" footer="notes" />
            </ShelfItem>
          </Shelf>
        </Demo>
        <Demo title="Barres and higher positions" note="F and Bm barres; a D and a Cmaj7 up the neck with the base fret beside the box.">
          <Shelf>
            <ShelfItem caption={f.label}>
              <ChordDiagram voicing={f} footer="degrees" />
            </ShelfItem>
            <ShelfItem caption={bm.label}>
              <ChordDiagram voicing={bm} />
            </ShelfItem>
            {d5 && (
              <ShelfItem caption={d5.label}>
                <ChordDiagram voicing={d5} />
              </ShelfItem>
            )}
            {cmaj7 && (
              <ShelfItem caption={cmaj7.label}>
                <ChordDiagram voicing={cmaj7} color="degree" dots="degrees" />
              </ShelfItem>
            )}
          </Shelf>
        </Demo>
        <Demo title="First chords" note="Small boxes as they appear in song lists and the chord library.">
          <Shelf>
            {OPEN_CHORDS.map((c) => (
              <ChordDiagram key={c} voicing={chordVoicings(c)[0]} size="sm" />
            ))}
          </Shelf>
        </Demo>
        <Demo title="Styles" note="Degree colours with notes inside, plain ink, left-handed, and a shape typed by hand with a capo.">
          <Shelf>
            <ShelfItem caption="degree colours">
              <ChordDiagram voicing={chordVoicings('Am7')[0]} color="degree" dots="notes" footer="degrees" />
            </ShelfItem>
            <ShelfItem caption="ink">
              <ChordDiagram chord="Dm" frets="xx0231" color="ink" />
            </ShelfItem>
            <ShelfItem caption="left-handed">
              <ChordDiagram voicing={g} leftHanded />
            </ShelfItem>
            <ShelfItem caption="capo 3, G shape = B♭">
              <ChordDiagram voicing={chordVoicings('Bb', { capo: 3 })[0]} />
            </ShelfItem>
          </Shelf>
        </Demo>
      </div>
    </Group>
  );
}

// ── circle of fifths ────────────────────────────────────────────────────────────────────────────

/** The interactive circle with the chords of the selected key spelled out beside it. */
export function CircleGroup() {
  const { naming } = useMusicSettings();
  const [key, setKey] = useState('G major');
  const chords = useMemo(() => diatonicChords(key), [key]);
  const k = getKey(key);
  return (
    <Group id="circle" index="03" title="Circle of fifths" blurb="Tap a key (or Tab in and use the arrow keys: left and right go round, up and down switch between major and minor).">
      <div className={styles.grid}>
        <Demo wide title="Interactive" note="The selected key, its signature, and its diatonic chords with their numerals.">
          <div className={styles.circleRow}>
            <CircleOfFifths value={key} onChange={setKey} />
            <div>
              <p className={styles.demoNote} aria-live="polite">
                {k ? `Chords in ${formatKey(k, { system: naming })}:` : ''}
              </p>
              <ul className={styles.chordList}>
                {chords.map((c) => (
                  <li key={c.roman}>
                    <span className={styles.chordRoman}>{formatRoman(c.roman)}</span>
                    <span className={styles.chordName}>{formatChord(c.symbol, { system: naming })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Demo>
        <Demo title="A minor, static" note="A picture for a lesson: no taps, just the key, its chords and two keys outlined.">
          <CircleOfFifths value="A minor" highlight={['E minor', 'D minor']} />
        </Demo>
        <Demo title="No key selected" note="Before the learner picks.">
          <CircleOfFifths onChange={() => undefined} />
        </Demo>
      </div>
    </Group>
  );
}

// ── notation ────────────────────────────────────────────────────────────────────────────────────

// "Ode to Joy" (Beethoven, public domain), in G, at guitar pitch.
const ODE = 'B3/q B3 C4 D4 | D4 C4 B3 A3 | G3 G3 A3 B3 | B3/q. A3/8 A3/h';
const ODE_COUNT = 15;
const INTERVALS: NotationItem[] = [
  { keys: ['C4', 'C4'], duration: 'w', label: 'P1' },
  { keys: ['C4', 'D4'], duration: 'w', label: 'M2' },
  { keys: ['C4', 'E4'], duration: 'w', label: 'M3' },
  { keys: ['C4', 'F4'], duration: 'w', label: 'P4' },
  { keys: ['C4', 'G4'], duration: 'w', label: 'P5' },
  { keys: ['C4', 'A4'], duration: 'w', label: 'M6' },
  { keys: ['C4', 'B4'], duration: 'w', label: 'M7' },
  { keys: ['C4', 'C5'], duration: 'w', label: 'P8' },
];

/** Standard notation examples for theory lessons. */
export function NotationGroup() {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  useInterval(() => setAt((i) => (i === null || i >= ODE_COUNT - 1 ? 0 : i + 1)), playing ? 450 : null);
  return (
    <Group id="notation" index="04" title="Notation" blurb="Standard notation engraved by VexFlow, loaded on first use. Guitar music in treble clef sounding an octave lower; ink follows the theme.">
      <div className={styles.grid}>
        <Demo
          wide
          title="A melody in G"
          note="“Ode to Joy” (Beethoven). Key and time signature, a dotted rhythm, note names under the notes, and a highlight that moves without redrawing."
          controls={
            <Button size="sm" iconLeft={playing ? 'Pause' : 'Play'} onClick={() => { setPlaying((p) => !p); if (playing) setAt(null); }}>
              {playing ? 'Stop' : 'Follow along'}
            </Button>
          }
        >
          <NotationView notes={ODE} keySignature="G major" time="4/4" labels="names" highlight={at} />
        </Demo>
        <Demo title="Intervals from C" note="Treble clef at written pitch, chords of two notes, custom labels.">
          <NotationView notes={INTERVALS} clef="treble" />
        </Demo>
        <Demo title="F♯ major, coloured by degree" note="The key signature with six sharps, and E♯ (not F) as its seventh note.">
          <NotationView notes="F#4/q G#4 A#4 B4 C#5 D#5 E#5 F#5" clef="treble" keySignature="F# major" colorBy="degree" labels="degrees" />
        </Demo>
        <Demo title="Rhythm in 6/8" note="Beams by the beat, ties across the barline, rests and accidentals that last to the bar's end.">
          <NotationView notes="A3/8 C4 E4 A4/q C5/8 | B4/q. G#4/8 A4/8 B4/8~ | B4/q r/8 E4/8 F4 G#4" time="6/8" keySignature="A minor" />
        </Demo>
        <Demo title="The open strings" note="Where the six open strings sit: the low E needs three ledger lines.">
          <NotationView notes={['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].map((n) => ({ keys: n, duration: 'h' as const }))} labels="names" />
        </Demo>
        <Demo title="Chords and a long line" note="Chords, triplets, sixteenths; lines break to the width of the screen.">
          <NotationView
            notes={[
              { keys: ['E3', 'B3', 'E4', 'G#4'], duration: 'h', label: 'E' },
              { keys: ['A3', 'E4', 'A4', 'C#5'], duration: 'h', label: 'A' },
              '|',
              { keys: 'E4', duration: '8', triplet: true },
              { keys: 'F#4', duration: '8', triplet: true },
              { keys: 'G#4', duration: '8', triplet: true },
              { keys: 'A4', duration: 'q', accent: true },
              { keys: 'B4', duration: '16' },
              { keys: 'C#5', duration: '16' },
              { keys: 'D5', duration: '16' },
              { keys: 'E5', duration: '16' },
              { keys: 'F#5', duration: 'q' },
              '|',
              { keys: ['B3', 'E4', 'G#4', 'B4'], duration: 'w', color: 'deg-5' },
            ]}
            time="4/4"
            keySignature="A major"
          />
        </Demo>
      </div>
    </Group>
  );
}

// ── piano ───────────────────────────────────────────────────────────────────────────────────────

const C_SCALE: PianoHighlight[] = [
  { note: 'C4', label: '1', color: 'deg-1' },
  { note: 'D4', label: '2', color: 'deg-2' },
  { note: 'E4', label: '3', color: 'deg-3' },
  { note: 'F4', label: '4', color: 'deg-4' },
  { note: 'G4', label: '5', color: 'deg-5' },
  { note: 'A4', label: '6', color: 'deg-6' },
  { note: 'B4', label: '7', color: 'deg-7' },
  { note: 'C5', label: '1', color: 'deg-1' },
];

/** The keyboard for theory away from the neck. */
export function PianoGroup() {
  const { naming } = useMusicSettings();
  const [last, setLast] = useState<string | null>(null);
  return (
    <Group id="piano" index="05" title="Piano keys" blurb="Half and whole steps are easiest to see on a keyboard. Ivory and ebony in both themes.">
      <div className={styles.grid}>
        <Demo title="C major scale" note="Degrees in their colours; the white keys alone.">
          <PianoKeys from="C4" to="C5" highlight={C_SCALE} />
        </Demo>
        <Demo title="E♭ major chord, two octaves" note="Highlights named as spelled (E♭, not D♯).">
          <PianoKeys from="C3" to="B4" highlight={[{ note: 'Eb3', color: 'deg-1' }, { note: 'G3', color: 'deg-3' }, { note: 'Bb3', color: 'deg-5' }]} labels="c" />
        </Demo>
        <Demo wide title="Tap a key" note="Each key is a button; arrow keys walk the keyboard.">
          <PianoKeys from="C3" to="B5" labels="c" onKeyPress={(k) => setLast(k.note)} highlight={last ? [{ note: last, color: 'accent' }] : []} />
          <p className={styles.status} aria-live="polite">
            {last ? `You tapped ${noteText(last, naming, { octave: true })}.` : 'Tap any key.'}
          </p>
        </Demo>
      </div>
    </Group>
  );
}

// ── rhythm ──────────────────────────────────────────────────────────────────────────────────────

const RHYTHMS: Array<{ title: string; rhythm: string; time?: string; note: string }> = [
  { title: 'Quarters and eighths', rhythm: 'q q e e q', note: 'The counting under the grid: what you play is in bold.' },
  { title: 'Two bars with a rest', rhythm: 'h q qr | e e e e h', note: 'Rests are hollow bars.' },
  { title: 'Sixteenths and accents', rhythm: '>e s s q >e e q', note: '“1 e & a”: the grid gets finer only when the rhythm needs it.' },
  { title: 'Compound time', rhythm: 'q. e e e | q e q.', time: '6/8', note: 'Two beats of three: “1 & a 2 & a”.' },
  { title: 'Triplets', rhythm: 'et et et q h', note: 'Three in the time of two: “1 trip let”.' },
  { title: 'A tie and a dotted note', rhythm: 'q. e ~e e q', note: 'The tied eighth is held, not played.' },
];

const STRUMS: Array<{ title: string; pattern: string; time?: string; note: string }> = [
  { title: 'The everyday pattern', pattern: 'D-DU-UDU', note: 'D, D U, U D U. The hand keeps moving through the missed strokes.' },
  { title: 'Accents and a muted strum', pattern: 'D>-DUX>UDU', note: 'A muted strum on beat 3, accented: the backbeat chop.' },
  { title: 'Sixteenths', pattern: 'D-DUD-DU-UDUD-DU', note: 'A funk feel: four slots to the beat.' },
  { title: 'Waltz in 3/4', pattern: 'D-DUDU', time: '3/4', note: 'One bar of three beats.' },
];

/** Rhythm grids and strumming patterns with a moving highlight. */
export function RhythmGroup() {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const grid = useMemo(() => rhythmGrid(parseRhythm(RHYTHMS[1].rhythm).notes), []);
  const strumCount = useMemo(() => parseStrum(STRUMS[0].pattern).steps.length, []);
  useInterval(() => setStep((s) => (s === null ? 0 : s + 1)), playing ? 300 : null);
  const toggle = () => {
    setPlaying((p) => !p);
    setStep(null);
  };
  return (
    <Group id="rhythm" index="06" title="Rhythm and strumming" blurb="Beat grids that a learner can count out loud: every step a column, the syllables underneath.">
      <div className={styles.grid}>
        <Demo
          wide
          title="Follow the highlight"
          note="A rhythm and a strumming pattern stepping along together, as they do during playback."
          controls={
            <Button size="sm" iconLeft={playing ? 'Pause' : 'Play'} onClick={toggle}>
              {playing ? 'Stop' : 'Step through'}
            </Button>
          }
        >
          <RhythmView rhythm={RHYTHMS[1].rhythm} current={step === null ? null : step % grid.cells.length} />
          <StrumPattern pattern={STRUMS[0].pattern} current={step === null ? null : step % strumCount} />
        </Demo>
        {RHYTHMS.map((r) => (
          <Demo key={r.title} title={r.title} note={r.note}>
            <RhythmView rhythm={r.rhythm} time={r.time} />
          </Demo>
        ))}
        {STRUMS.map((s) => (
          <Demo key={s.title} title={s.title} note={s.note}>
            <StrumPattern pattern={s.pattern} time={s.time} />
          </Demo>
        ))}
      </div>
    </Group>
  );
}

// ── small pieces ────────────────────────────────────────────────────────────────────────────────

/** Badges, the legend and tuning labels. */
export function BitsGroup() {
  return (
    <Group id="bits" index="07" title="Small pieces" blurb="Note and interval chips, the degree-colour legend, and tuning labels, all in the learner's note names.">
      <div className={styles.grid}>
        <Demo title="Note badges" note="Coloured by degree, with the degree beside the name; neutral without one.">
          <Shelf>
            <NoteBadge note="A" degree="1" />
            <NoteBadge note="C" degree="b3" />
            <NoteBadge note="D" degree="4" />
            <NoteBadge note="E" degree="5" />
            <NoteBadge note="G" degree="b7" />
            <NoteBadge note="F#4" octave />
            <NoteBadge note="Bb" size="sm" />
            <NoteBadge note="E#" degree="7" size="lg" />
          </Shelf>
        </Demo>
        <Demo title="Interval badges" note="Coloured by the degree they reach; the full name is spoken.">
          <Shelf>
            <IntervalBadge interval="P1" />
            <IntervalBadge interval="m3" long />
            <IntervalBadge interval="M3" />
            <IntervalBadge interval="P5" long />
            <IntervalBadge interval="-M2" />
            <IntervalBadge interval="m7" />
            <IntervalBadge interval="M9" size="sm" />
          </Shelf>
        </Demo>
        <Demo title="Degree legend" note="Explains the colours. The full set, a pentatonic subset, and a compact row.">
          <DegreeLegend />
          <DegreeLegend degrees={['1', 'b3', '4', '5', 'b7']} title="Minor pentatonic" />
          <DegreeLegend degrees={['1', '3', '5', 'b7']} compact />
        </Demo>
        <Demo title="Tuning labels" note="Name, strings low to high, and a capo.">
          <TuningLabel />
          <TuningLabel tuning="drop-d" capo={2} />
          <TuningLabel tuning="dadgad" />
          <TuningLabel tuning="open-g" highFirst />
        </Demo>
      </div>
    </Group>
  );
}
