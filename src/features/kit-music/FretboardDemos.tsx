import { useMemo, useState } from 'react';
import { arpeggioPatterns, chordVoicings, rootToRoot, scalePatterns } from '@/core/guitar';
import { chroma } from '@/core/theory';
import { Button, SegmentedControl, Select } from '@/ui';
import {
  DegreeLegend,
  Fretboard,
  noteText,
  patternMarkers,
  scaleMarkers,
  useMusicSettings,
  voicingOnBoard,
  type FretMarker,
  type FretboardInlay,
  type FretboardWood,
  type MarkerLabelMode,
} from '@/ui/music';
import { Demo, Group, ShelfItem, kitStyles as styles } from './parts';

const WOODS: FretboardWood[] = ['rosewood', 'maple', 'ebony', 'pau-ferro', 'roasted-maple', 'koa'];
const INLAYS: FretboardInlay[] = ['dots', 'offset-dots', 'blocks', 'diamonds', 'sharkfin', 'vine'];
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Every fretboard configuration the app uses. */
export function FretboardGroup() {
  const box1 = useMemo(() => scalePatterns('A', 'minor-pentatonic')[0], []);
  const [boxLabels, setBoxLabels] = useState<MarkerLabelMode>('degree');
  const boxMarkers = useMemo(() => patternMarkers(box1, { label: boxLabels, color: boxLabels === 'finger' ? 'finger' : 'degree' }), [box1, boxLabels]);
  const run = useMemo(() => rootToRoot(box1, { octaves: 1 }), [box1]);
  const runMarkers = useMemo(() => patternMarkers({ ...box1, notes: run }, { label: 'note' }), [box1, run]);

  const [neck, setNeck] = useState<'12' | '24'>('12');
  const [spacing, setSpacing] = useState<'proportional' | 'even'>('proportional');
  const cMajor = useMemo(() => scaleMarkers('C', 'major', { maxFret: neck === '12' ? 12 : 24 }), [neck]);

  const g = useMemo(() => voicingOnBoard(chordVoicings('G')[0]), []);
  const f = useMemo(() => voicingOnBoard(chordVoicings('F')[0]), []);
  const am7 = useMemo(() => arpeggioPatterns('Am7').find((p) => p.minFret >= 4 && p.minFret <= 6) ?? arpeggioPatterns('Am7')[0], []);
  const am7Markers = useMemo(() => patternMarkers(am7, { label: 'degree' }), [am7]);
  const capoA = useMemo(() => voicingOnBoard(chordVoicings('A', { capo: 2 })[0], { label: 'note' }), []);

  return (
    <Group id="fretboard" index="01" title="Fretboard" blurb="The instrument in real materials. Fit to the width on a phone, sharp on a big screen, and every note on it labelled, coloured and readable.">
      <div className={styles.grid}>
        <Demo
          wide
          title="A minor pentatonic, box 1"
          note="A scale pattern from the engine, with the position box and degree colours. Switch what the dots say."
          controls={
            <SegmentedControl
              aria-label="Dot labels"
              size="sm"
              value={boxLabels}
              onChange={setBoxLabels}
              options={[
                { value: 'degree', label: 'Degrees' },
                { value: 'note', label: 'Notes' },
                { value: 'finger', label: 'Fingers' },
                { value: 'interval', label: 'Intervals' },
              ]}
            />
          }
        >
          <Fretboard frets={[3, 10]} markers={boxMarkers} box={{ from: box1.minFret, to: box1.maxFret, label: `${box1.name} · ${box1.positionName}` }} />
          <DegreeLegend degrees={['1', 'b3', '4', '5', 'b7']} />
        </Demo>

        <Demo
          wide
          title="C major across the neck"
          note="Every note of the scale. Real fret spacing blends toward even spacing only as much as a narrow screen needs."
          controls={
            <>
              <SegmentedControl aria-label="Frets" size="sm" value={neck} onChange={setNeck} options={[{ value: '12', label: '0–12' }, { value: '24', label: '0–24' }]} />
              <SegmentedControl aria-label="Spacing" size="sm" value={spacing} onChange={setSpacing} options={[{ value: 'proportional', label: 'Real' }, { value: 'even', label: 'Even' }]} />
            </>
          }
        >
          <Fretboard frets={[0, neck === '12' ? 12 : 24]} spacing={spacing} markers={cMajor} />
        </Demo>

        <Demo title="G major, open" note="A chord voicing: fingers in finger colours, open strings as rings at the nut.">
          <Fretboard frets={[0, 4]} {...g} />
        </Demo>
        <Demo title="F major, barre" note="The barre as a bar under the dots; the index finger lies across all six strings.">
          <Fretboard frets={[0, 4]} {...f} />
        </Demo>

        <Demo title="Root to root, with a path" note="The notes of box 1 from the low A to the next A, connected in playing order.">
          <Fretboard frets={[4, 9]} markers={runMarkers} path="markers" />
        </Demo>
        <Demo title="Am7 arpeggio" note={`${am7.name}, ${am7.positionName}: chord tones only, the root emphasised.`}>
          <Fretboard frets={[Math.max(0, am7.minFret - 1), am7.maxFret + 1]} markers={am7Markers} />
        </Demo>

        <Demo title="Left-handed" note="The same box mirrored: the nut on the right, high E still on top. Data never changes.">
          <Fretboard frets={[3, 10]} markers={boxMarkers} leftHanded box={{ from: box1.minFret, to: box1.maxFret }} />
        </Demo>
        <Demo title="Capo on 2" note="An A chord played as a G shape behind a capo. Frets count from the capo, as in tab.">
          <Fretboard frets={[0, 6]} capo={2} {...capoA} />
        </Demo>

        <Demo title="Vertical" note="Nut on top, low string on the left: the chord-box view of the neck.">
          <div className={styles.pairs}>
            <Fretboard frets={[0, 4]} orientation="vertical" {...g} />
            <Fretboard frets={[0, 4]} orientation="vertical" leftHanded {...g} aria-label="G major, left-handed, vertical" />
          </div>
        </Demo>
        <Demo title="Marker states and shapes" note="Target pulses, hit and miss carry a mark (never colour alone), ghost is dimmed, the root is larger.">
          <Fretboard frets={[0, 5]} fretNumbers="all" markers={STATE_MARKERS} />
        </Demo>

        <FindTheNote />

        <Demo wide title="Woods and inlays" note="Every wood and inlay a learner can equip. Wood is wood: the board looks the same in both themes.">
          <div className={styles.woods}>
            {WOODS.map((wood, i) => (
              <ShelfItem key={wood} caption={`${wood.replace('-', ' ')} · ${INLAYS[i].replace('-', ' ')}`}>
                <Fretboard frets={[0, 12]} size="sm" wood={wood} inlay={INLAYS[i]} stringLabels={false} fretNumbers="none" markers={WOOD_MARKERS} />
              </ShelfItem>
            ))}
          </div>
        </Demo>

        <Demo wide title="Seven strings, drop D, bass" note="The board follows the tuning: string count, labels, wound strings.">
          <Fretboard frets={[0, 7]} tuning="standard-7" size="sm" markers={scaleMarkers('E', 'minor', { tuning: 'standard-7', maxFret: 7 })} />
          <Fretboard frets={[0, 7]} tuning="drop-d" size="sm" markers={scaleMarkers('D', 'major', { tuning: 'drop-d', maxFret: 7 })} />
          <Fretboard frets={[0, 7]} tuning="bass" size="md" markers={scaleMarkers('E', 'minor-pentatonic', { tuning: 'bass', maxFret: 7 })} />
        </Demo>
      </div>
    </Group>
  );
}

const STATE_MARKERS: FretMarker[] = [
  { string: 6, fret: 0, label: 'E', color: 'deg-x', shape: 'ring' },
  { string: 5, fret: 3, label: 'C', color: 'deg-1', root: true },
  { string: 4, fret: 2, label: 'E', color: 'deg-3' },
  { string: 3, fret: 0, label: 'G', color: 'deg-5', shape: 'ring' },
  { string: 2, fret: 1, label: 'C', color: 'deg-1', root: true, shape: 'square' },
  { string: 1, fret: 3, label: 'G', color: 'deg-5', shape: 'diamond' },
  { string: 6, fret: 3, label: '?', color: 'accent', state: 'target' },
  { string: 5, fret: 5, label: 'D', color: 'ok', state: 'hit' },
  { string: 4, fret: 5, label: 'G', color: 'bad', state: 'miss' },
  { string: 3, fret: 4, label: 'B', color: 'deg-7', state: 'ghost' },
  { string: 2, fret: 4, label: '3', color: 'finger-3' },
  { string: 1, fret: 5, label: '4', color: 'finger-4' },
];

const WOOD_MARKERS: FretMarker[] = [
  { string: 5, fret: 3, label: 'C', color: 'deg-1', root: true },
  { string: 4, fret: 2, label: 'E', color: 'deg-3' },
  { string: 2, fret: 1, label: 'C', color: 'deg-1', root: true },
  { string: 3, fret: 5, label: 'C', color: 'deg-1', root: true, state: 'target' },
];

/** A tap-the-note round: every cell is a button. */
function FindTheNote() {
  const { naming } = useMusicSettings();
  const [target, setTarget] = useState('C');
  const [taps, setTaps] = useState<FretMarker[]>([]);
  const [status, setStatus] = useState('');
  const found = taps.filter((t) => t.state === 'hit').length;
  const next = () => {
    const options = NATURALS.filter((n) => n !== target);
    setTarget(options[Math.floor(Math.random() * options.length)]);
    setTaps([]);
    setStatus('');
  };
  return (
    <Demo
      wide
      title="Tap the note"
      note="Every string × fret cell is a real button (Tab in, then arrow keys). Labels say only the position, so they do not give the answer away."
      controls={
        <>
          <Select label="Note to find" hideLabel size="sm" value={target} onChange={(v) => { setTarget(v); setTaps([]); setStatus(''); }} options={NATURALS.map((n) => ({ value: n, label: `Find ${noteText(n, naming)}` }))} />
          <Button size="sm" onClick={next}>
            Another note
          </Button>
        </>
      }
    >
      <Fretboard
        frets={[0, 5]}
        cellLabels="position"
        markers={taps}
        onCellClick={(cell) => {
          const right = chroma(cell.note) === chroma(target);
          const name = noteText(cell.note, naming);
          setTaps((t) => [...t.filter((m) => !(m.string === cell.string && m.fret === cell.fret)), { string: cell.string, fret: cell.fret, label: name, color: right ? 'ok' : 'bad', state: right ? 'hit' : 'miss', note: cell.note }]);
          setStatus(right ? `Yes, that is ${name}.` : `That is ${name}. Look for ${noteText(target, naming)}.`);
        }}
      />
      <p className={styles.status} aria-live="polite">
        {status || `Find every ${noteText(target, naming)} between the nut and fret 5.`} {found > 0 && `${found} found.`}
      </p>
    </Demo>
  );
}
