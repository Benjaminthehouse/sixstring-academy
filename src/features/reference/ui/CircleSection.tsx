/**
 * The circle of fifths: pick a key on the circle and see its signature, relative and parallel
 * keys, its chords with numerals and jobs, its neighbours, its notes on the neck and its scale
 * on the staff; play its I–IV–V–I.
 */
import { useEffect, useMemo, useState } from 'react';
import { href } from '@/app/router';
import { usePrefs } from '@/core/progress';
import { learnerTuning } from '@/core/settings';
import { noteSlug } from '@/core/theory';
import { ActionBar, Button, Icon, LinkButton, Section, Text, cx, useIsMobile } from '@/ui';
import { CircleOfFifths, DegreeLegend, Fretboard, NotationView, scaleMarkers } from '@/ui/music';
import { cadenceOf, circleKey, functionLetter, keyChordRow, keyFromParam, neckScaleOf, neighboursOf, signatureWords, DEFAULT_KEY, type KeyChord } from '../model/circle';
import { raisedSeventh, scaleLine } from '../model/keys';
import type { SectionProps } from './SectionBody';
import { playProgression, strumChord } from './sound';
import styles from './Sections.module.css';

/** The function stripe colour: tonic, subdominant and dominant take the colours of degrees 1, 4 and 5. */
export function functionClass(f: KeyChord['function']): string {
  return f === 'tonic' ? styles.fnTonic : f === 'subdominant' ? styles.fnSub : styles.fnDom;
}

/** Words for a function. */
export function functionWord(f: KeyChord['function']): string {
  return f === 'tonic' ? 'Tonic' : f === 'subdominant' ? 'Subdominant' : 'Dominant';
}

/** The circle of fifths page. */
export function CircleSection({ item, reveal, level, fmt, sounder }: SectionProps) {
  const prefs = usePrefs();
  const isPhone = useIsMobile();
  const tuning = useMemo(() => learnerTuning(prefs), [prefs]);
  const [keyName, setKeyName] = useState(() => keyFromParam(item)?.name ?? DEFAULT_KEY);
  useEffect(() => {
    const k = keyFromParam(item);
    if (k) setKeyName(k.name);
  }, [item, reveal]);

  const k = circleKey(keyName);
  const chords = useMemo(() => keyChordRow(k), [k]);
  const cadence = useMemo(() => cadenceOf(k), [k]);
  const neighbours = useMemo(() => neighboursOf(k), [k]);
  const neck = neckScaleOf(k);
  const markers = useMemo(() => scaleMarkers(neck.tonic, neck.scale, { maxFret: 12, label: 'degree', tuning }), [neck.tonic, neck.scale, tuning]);
  const line = useMemo(() => scaleLine(k), [k]);
  const [step, setStep] = useState(-1);

  const cadenceId = `cadence:${k.id}`;
  const playingCadence = sounder.playing === cadenceId;
  useEffect(() => {
    if (!playingCadence) setStep(-1);
  }, [playingCadence]);

  const select = (name: string) => {
    setKeyName(name);
    if (sounder.playing) sounder.stop();
  };

  const playCadence = () => sounder.toggle(cadenceId, () => playProgression(cadence.chords, tuning, setStep));
  const cadenceLabel = cadence.romans.map(fmt.roman).join('–');
  const mainChords = chords.filter((c) => c.variant !== 'harmonic');
  const borrowed = chords.filter((c) => c.variant === 'harmonic');
  const playButton = (
    <Button variant="primary" size="lg" iconLeft={playingCadence ? 'Square' : 'Play'} onClick={playCadence} pressed={playingCadence} aria-label={playingCadence ? 'Stop' : `Play ${cadenceLabel} in ${fmt.key(k.name)}`}>
      {playingCadence ? 'Stop' : `Play ${cadenceLabel}`}
    </Button>
  );
  const relative = keyFromParam(k.relative);
  const parallel = keyFromParam(k.parallel);

  return (
    <div className={styles.stack} data-key={k.id} data-cadence-step={step}>
      <div className={styles.circleLayout}>
        <div className={styles.circleWrap}>
          <CircleOfFifths value={k.name} onChange={select} naming={fmt.naming} highlight={neighbours.filter((n) => n.role !== 'parallel').map((n) => n.key.name)} />
          <Text variant="caption" tone="muted" align="center">
            Tap a key. Outer ring: major keys; inner ring: their relative minors.
          </Text>
        </div>

        <div className={styles.keyPanel}>
          <div>
            <p className={styles.kicker}>
              {signatureWords(k).replace(/^\w/, (c) => c.toUpperCase())}
              {k.signature.count > 0 && <span className={styles.kickerNotes}> · {fmt.notes(k.signature.accidentals)}</span>}
            </p>
            <p className={styles.keyName} aria-live="polite">
              {fmt.key(k.name)}
            </p>
            <div className={styles.related}>
              {relative && (
                <button type="button" className={styles.relatedButton} onClick={() => select(relative.name)}>
                  <span className={styles.relatedLabel}>Relative</span>
                  {fmt.key(relative.name)}
                </button>
              )}
              {parallel && (
                <button type="button" className={styles.relatedButton} onClick={() => select(parallel.name)}>
                  <span className={styles.relatedLabel}>Parallel</span>
                  {fmt.key(parallel.name)}
                </button>
              )}
            </div>
          </div>

          <dl className={styles.facts}>
            <div>
              <dt>Scale</dt>
              <dd className={styles.mono}>{fmt.notes(k.scale)}</dd>
            </div>
            <div>
              <dt>Home chord</dt>
              <dd>{fmt.chord(chords[0].symbol)}</dd>
            </div>
            <div>
              <dt>{k.mode === 'minor' ? 'Leading tone' : 'Dominant'}</dt>
              <dd>{k.mode === 'minor' ? `${fmt.note(raisedSeventh(k) ?? '')} (raised 7th)` : fmt.chord(chords[4].symbol)}</dd>
            </div>
          </dl>

          <div className={styles.playRow}>
            {!isPhone && playButton}
            <Text variant="caption" tone="muted">
              {cadenceLabel} in {fmt.key(k.name)}: {cadence.chords.map(fmt.chord).join(' – ')}
            </Text>
          </div>
        </div>
      </div>

      <div className={styles.keyChords}>
        <p className={styles.blockLabel}>Chords of {fmt.key(k.name)} · tap one to hear it</p>
        <div className={styles.chordCells} role="list" aria-label={`Chords of ${fmt.key(k.name)}`}>
          {mainChords.map((c, i) => (
            <ChordCell key={`${c.roman}-${i}`} chord={c} fmt={fmt} active={step >= 0 && cadence.romans[step] === c.roman} onPlay={() => sounder.toggle(`chord:${k.id}:${c.roman}`, () => strumChord(c.symbol, tuning))} />
          ))}
        </div>
        {borrowed.length > 0 && (
          <div className={styles.borrowed}>
            <Text variant="caption" tone="muted">
              From harmonic minor, which raises the 7th to {fmt.note(raisedSeventh(k) ?? '')}:
            </Text>
            <div className={styles.chordCells} role="list" aria-label="Chords from harmonic minor">
              {borrowed.map((c, i) => (
                <ChordCell key={`h-${c.roman}-${i}`} chord={c} fmt={fmt} active={step >= 0 && cadence.romans[step] === c.roman} onPlay={() => sounder.toggle(`chord:${k.id}:h${c.roman}`, () => strumChord(c.symbol, tuning))} />
              ))}
            </div>
          </div>
        )}
      </div>

      <Section level={level} title="Neighbours" description="Keys one step around the circle differ by one sharp or flat: the easiest places to move to.">
        <div className={styles.neighbours}>
          {neighbours.map((n) => (
            <button key={n.role} type="button" className={styles.neighbour} onClick={() => select(n.key.name)}>
              <span className={styles.neighbourRole}>{n.label}</span>
              <span className={styles.neighbourKey}>{fmt.key(n.key.name)}</span>
              <span className={styles.neighbourSig}>{signatureWords(n.key)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        level={level}
        title="On the neck"
        description={`Every ${fmt.key(k.name)} note from the nut to fret 12, labelled by scale degree (R is the root).`}
        actions={
          <LinkButton to="scales" params={[noteSlug(neck.tonic), neck.scale]} variant="ghost" size="sm" iconRight="ArrowRight">
            Shapes in Scales
          </LinkButton>
        }
      >
        <div className={styles.neck}>
          <Fretboard frets={[0, 12]} markers={markers} tuning={tuning} size="md" />
        </div>
        <DegreeLegend compact degrees={k.mode === 'minor' ? ['1', '2', 'b3', '4', '5', 'b6', 'b7'] : ['1', '2', '3', '4', '5', '6', '7']} />
      </Section>

      <Section level={level} title="On the staff" description="The signature and one octave of the scale, written for guitar (it sounds an octave lower).">
        <div className={styles.staff}>
          <NotationView notes={line.map((n) => ({ keys: n, duration: 'q' as const }))} keySignature={k.name} labels="names" naming={fmt.naming} aria-label={`${fmt.key(k.name)} scale on the staff`} />
        </div>
        <a className={styles.inlineLink} href={href('reference', 'keys', k.mode === 'major' ? k.id : keyFromParam(k.relative)?.id ?? k.id)}>
          <Icon name="KeyRound" size="xs" /> All key signatures
        </a>
      </Section>
      {isPhone && <ActionBar>{playButton}</ActionBar>}
    </div>
  );
}

/** One chord of the key: numeral, symbol and job; tap to hear it. */
function ChordCell({ chord, fmt, active, onPlay }: { chord: KeyChord; fmt: SectionProps['fmt']; active: boolean; onPlay: () => void }) {
  return (
    <div role="listitem" className={styles.chordCellItem}>
      <button type="button" className={cx(styles.chordCell, functionClass(chord.function), active && styles.chordCellActive)} onClick={onPlay} aria-label={`${fmt.roman(chord.roman)}: ${fmt.chord(chord.symbol)}, ${functionWord(chord.function).toLowerCase()}. Play it.`}>
        <span className={styles.cellRoman}>{fmt.roman(chord.roman)}</span>
        <span className={styles.cellChord}>{fmt.chord(chord.symbol)}</span>
        <span className={styles.cellFn}>
          <span className={styles.fnDot} aria-hidden="true" />
          {functionLetter(chord.function)}
        </span>
      </button>
    </div>
  );
}
