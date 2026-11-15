import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Icon, Popover, Spinner, VisuallyHidden, cx, focusRing, useLatest, usePrefersReducedMotion, useRafLoop } from '@/ui';
import { LEVEL_MESSAGES, TIP_MESSAGES, instructionText, spokenReading, type InstructionIcon } from '../model/advice';
import { formatHz, offsetWords } from '../model/scale';
import type { MeterFrame, SessionView, TunerSession } from '../model/session';
import { noteParts, stringWords, type NoteNaming, type StringTarget } from '../model/targets';
import { NeedleMeter } from './NeedleMeter';
import { StrobeMeter } from './StrobeMeter';
import styles from './Readout.module.css';

/** The by-ear state the readout shows instead of a reading. */
export interface EarReadout {
  /** Target index of the string chosen. */
  index: number;
  /** Its note is sounding right now. */
  playing: boolean;
}

/** Props for `<Readout>`. */
export interface ReadoutProps {
  session: TunerSession;
  view: SessionView;
  targets: readonly StringTarget[];
  /** What the idle readout says under the strings: `Standard tuning`, `Drop D tuning, capo 2`. */
  tuningCaption: string;
  naming: NoteNaming;
  /** The tuning's strings do not rise in pitch (ukulele): strings are then named by number only. */
  reentrant: boolean;
  /** Cents either side of the note that count as in tune. */
  tolerance: number;
  /** Show tenths of a cent. */
  fine: boolean;
  display: 'needle' | 'strobe';
  showHz: boolean;
  /** Set while tuning by ear (the microphone is off). */
  ear: EarReadout | null;
  /** MIDI number of the reference note the app is playing, or null. */
  toneMidi: number | null;
  /** By-ear controls, drawn where the meter is. */
  earControls?: ReactNode;
  /** Controls at the two ends of the card's top row (the tuning chip, the settings button). */
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
}

const ICONS: Record<InstructionIcon, string> = { pluck: 'Hand', up: 'ArrowUp', down: 'ArrowDown', hold: 'Pause', check: 'Check', warning: 'TriangleAlert' };

/** Input level drawn between these, in dBFS. */
const LEVEL_MIN_DB = -72;
const LEVEL_MAX_DB = -12;
/** A title longer than this is set a size smaller so it stays on one line on a phone. */
const LONG_TITLE = 17;

function levelFraction(db: number): number {
  return Math.min(1, Math.max(0, (db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB)));
}

/**
 * The tuner's face: the note in very large type, the meter, the offset as a number and the
 * instruction in words. Everything that changes with the audio (marker, number, level, data
 * attributes) is written straight to the DOM; React only re-renders when the wording changes.
 *
 * The root mirrors the live state for tests: `data-state` (idle, listening, hearing, in-tune),
 * `data-note` (E2), `data-cents` (one decimal) and `data-string` (string number or empty).
 */
export function Readout({ session, view, targets, tuningCaption, naming, reentrant, tolerance, fine, display, showHz, ear, toneMidi, earControls, headerStart, headerEnd }: ReadoutProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const amountRef = useRef<HTMLSpanElement | null>(null);
  const unitRef = useRef<HTMLSpanElement | null>(null);
  const sideRef = useRef<HTMLSpanElement | null>(null);
  const hzRef = useRef<HTMLSpanElement | null>(null);
  const levelRef = useRef<HTMLSpanElement | null>(null);
  const gateRef = useRef<HTMLSpanElement | null>(null);
  const written = useRef({ stamp: -1, amount: '', unit: '', side: '', hz: '', level: -1, gate: -1 });
  const reducedMotion = usePrefersReducedMotion();
  const fineRef = useLatest(fine);

  // The data attributes follow the session directly (not the paint loop), so a test or a screen
  // reader bridge reads the newest truth even when the tab is not being painted.
  useEffect(() => {
    const apply = (f: MeterFrame): void => {
      const el = rootRef.current;
      if (!el) return;
      if (el.dataset.state !== f.state) el.dataset.state = f.state;
      if (el.dataset.note !== f.note) el.dataset.note = f.note;
      if (el.dataset.cents !== f.centsText) el.dataset.cents = f.centsText;
      if (el.dataset.string !== f.string) el.dataset.string = f.string;
    };
    apply(session.frame);
    return session.onFrame(apply);
  }, [session]);

  useRafLoop(() => {
    const f = session.frame;
    const w = written.current;
    // Refs can be remounted (meter style, by-ear mode): write again whenever a node is new.
    const fresh = amountRef.current !== null && amountRef.current.textContent === '';
    if (f.stamp === w.stamp && !fresh) return;
    w.stamp = f.stamp;
    const words = offsetWords(f.cents, fineRef.current ? 1 : 0);
    if ((words.amount !== w.amount || fresh) && amountRef.current) {
      w.amount = words.amount;
      amountRef.current.textContent = words.amount;
    }
    if ((words.unit !== w.unit || fresh) && unitRef.current) {
      w.unit = words.unit;
      unitRef.current.textContent = words.unit;
    }
    if ((words.side !== w.side || fresh) && sideRef.current) {
      w.side = words.side;
      sideRef.current.textContent = words.side;
    }
    if (hzRef.current) {
      const hz = f.live ? formatHz(f.freq) : '';
      if (hz !== w.hz || hzRef.current.textContent === '') {
        w.hz = hz;
        hzRef.current.textContent = hz || '– Hz';
      }
    }
    const level = Math.round(levelFraction(f.db) * 100) / 100;
    if (levelRef.current && (level !== w.level || !levelRef.current.style.transform)) {
      w.level = level;
      levelRef.current.style.transform = `scaleX(${level})`;
    }
    const gate = Math.round(levelFraction(f.gateDb) * 100);
    if (gateRef.current && (gate !== w.gate || !gateRef.current.style.left)) {
      w.gate = gate;
      gateRef.current.style.left = `${gate}%`;
    }
  });

  const listening = view.source === 'mic';
  const earTarget = ear ? targets[ear.index] ?? null : null;
  const shownTarget = !ear && view.shownIndex >= 0 ? targets[view.shownIndex] ?? null : null;
  const heroNote = earTarget ? earTarget.note : listening ? view.shownNote : '';
  const parts = heroNote ? noteParts(heroNote, naming) : null;
  const heroLive = !!earTarget || view.shownLive;
  const guideTarget = view.target >= 0 ? targets[view.target] ?? null : null;

  // Words for the string on the readout.
  const captionTarget = earTarget ?? shownTarget;
  const words = captionTarget ? stringWords(captionTarget.index, targets.length, reentrant) : null;
  let caption = '';
  if (captionTarget) {
    const end = reentrant ? '' : captionTarget.index === 0 ? ' · thickest' : captionTarget.index === targets.length - 1 ? ' · thinnest' : '';
    caption = `String ${captionTarget.string}${end}`;
  } else if (listening && view.mode === 'chromatic' && parts) caption = 'Any note';
  else if (!listening && !ear) caption = tuningCaption;
  else if (listening) caption = view.paused ? 'Paused' : 'Listening for a string';

  // The instruction in words.
  const targetForText = shownTarget ?? guideTarget;
  const targetWords = targetForText ? stringWords(targetForText.index, targets.length, reentrant) : null;
  const other = view.otherIndex >= 0 ? targets[view.otherIndex] ?? null : null;
  const instruction = instructionText(view.instruction, {
    mode: view.mode,
    note: parts ? parts.short : '',
    stringName: targetWords ? targetWords.name : '',
    where: view.mode === 'guide' && targetWords ? targetWords.where : undefined,
    otherNote: other ? noteParts(other.note, naming).short : undefined,
    otherStringName: other ? stringWords(other.index, targets.length, reentrant).name : undefined,
  });

  let title = instruction.title;
  let detail = instruction.detail;
  let tone: 'neutral' | 'ok' | 'warn' = instruction.tone;
  let icon: string = ICONS[instruction.icon];
  if (ear && earTarget) {
    title = ear.playing ? 'Match this note' : `Hear the ${words ? words.name : 'string'}`;
    detail = ear.playing
      ? 'Pluck that string and turn its peg until the two sound like one. A slow wobble means close.'
      : 'Play the note, then pluck the same string on your guitar and compare.';
    tone = 'neutral';
    icon = 'Ear';
  } else if (!listening) {
    if (view.source === 'starting') {
      title = 'Starting the microphone';
      detail = 'If your browser asks, choose Allow.';
    } else {
      title = 'Ready to tune';
      detail = 'Start tuning, then pluck one string at a time. The tuner tells you which way to turn the peg.';
    }
    icon = 'Mic';
    tone = 'neutral';
  } else if (view.paused) {
    title = 'Listen to the note';
    detail = 'The microphone waits while the note plays.';
    tone = 'neutral';
    icon = 'Volume2';
  } else if (view.instruction === 'pluck' && view.allConfirmed && view.mode !== 'guide') {
    // Nothing left to do: say so where the next instruction would have been.
    title = `All ${targets.length} strings are in tune`;
    detail = 'Strum a chord and enjoy it. Strings drift as you play, so check again any time.';
    tone = 'ok';
    icon = 'Check';
  }

  const showReading = listening && !view.paused && view.shownNote !== '' && (view.shownLive || view.shownIndex < 0 || view.mode === 'auto');
  const readingLive = showReading && view.shownLive;
  const parked = !listening || view.paused || view.shownNote === '' || (!view.shownLive && (view.mode === 'guide' || view.mode === 'locked'));

  // One line under the instruction. A warning from the instruction itself (far off, wrong string)
  // comes first, then a problem with the input level, then a hint, then the plain explanation.
  let detailKind: 'plain' | 'warn' | 'tip' = tone === 'warn' ? 'warn' : 'plain';
  if (listening && !view.paused && tone !== 'warn') {
    if (view.advice !== 'ok') {
      detail = `${LEVEL_MESSAGES[view.advice]}.`;
      detailKind = view.advice === 'hum' ? 'tip' : 'warn';
    } else if (view.tip) {
      detail = TIP_MESSAGES[view.tip];
      detailKind = 'tip';
    }
  }
  const spoken = listening && !view.paused ? spokenReading(view.instruction, instruction, session.frame.cents, parts ? parts.text : '') : '';

  // The number between the two ends of the meter: "12 cents low".
  const number = (
    <span className={cx(styles.offset, !showReading && styles.offsetHidden, showReading && !readingLive && styles.offsetStale)}>
      <span ref={amountRef} className={styles.offsetAmount} />
      <Popover
        aria-label="What is a cent?"
        placement="top"
        trigger={
          <button type="button" className={cx(styles.offsetUnit, focusRing)} aria-label="cents: what is a cent?" tabIndex={showReading ? 0 : -1}>
            <span ref={unitRef}>cents</span>
          </button>
        }
      >
        <p className={styles.help}>
          A cent is a hundredth of the step between two neighbouring frets. Within {tolerance} {tolerance === 1 ? 'cent' : 'cents'} of the note, a string sounds in tune.
        </p>
      </Popover>
      <span ref={sideRef} className={styles.offsetSide} />
    </span>
  );

  const statusText = ear ? 'By ear' : view.source === 'starting' ? 'Starting' : listening ? (view.paused ? 'Paused' : 'Listening') : 'Mic off';

  return (
    <section
      ref={rootRef}
      className={cx(styles.readout, tone === 'ok' && styles.toneOk, tone === 'warn' && styles.toneWarn)}
      aria-label="Tuner"
      data-tuner-readout=""
      data-state="idle"
      data-note=""
      data-cents=""
      data-string=""
      data-source={ear ? 'ear' : view.source}
      data-mode={view.mode}
      data-instruction={listening ? view.instruction : ''}
      data-target={guideTarget ? guideTarget.note : ''}
      data-tuned={targets.filter((_, i) => view.confirmed[i]).map((t) => t.string).join(',')}
      data-ear-note={earTarget ? earTarget.note : ''}
      data-tone={toneMidi === null ? '' : String(toneMidi)}
      data-advice={listening ? view.advice : ''}
    >
      <div className={styles.header}>
        {headerStart}
        <span className={cx(styles.status, listening && !view.paused && styles.statusOn)}>
          {view.source === 'starting' ? <Spinner size={14} /> : <Icon name={ear ? 'Volume2' : listening ? (view.paused ? 'Pause' : 'Mic') : 'MicOff'} size="xs" />}
          <span>{statusText}</span>
          {listening && (
            <span className={styles.level} aria-hidden="true">
              <span ref={levelRef} className={cx(styles.levelFill, view.advice === 'too-loud' && styles.levelHot)} />
              <span ref={gateRef} className={styles.levelGate} />
            </span>
          )}
        </span>
        {headerEnd}
      </div>

      <div className={styles.hero}>
        {parts ? (
          <p className={cx(styles.note, !heroLive && styles.noteWaiting, readingLive && view.state === 'in-tune' && styles.noteInTune)} aria-hidden="true">
            <span className={styles.noteLetter}>{parts.letter}</span>
            <span className={styles.noteSide}>
              <span className={styles.noteAccidental}>{parts.accidental}</span>
              <span className={styles.noteOctave}>{parts.octave}</span>
            </span>
          </p>
        ) : listening ? (
          <p className={styles.waiting} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </p>
        ) : (
          <p className={styles.tuningHero} aria-hidden="true" style={{ '--count': targets.length } as CSSProperties}>
            {targets.map((t) => {
              const p = noteParts(t.note, naming);
              return (
                <span key={t.index} className={styles.tuningNote}>
                  {p.letter}
                  {p.accidental && <span className={styles.tuningAccidental}>{p.accidental}</span>}
                </span>
              );
            })}
          </p>
        )}
        <p className={styles.caption}>
          {parts && <VisuallyHidden>{parts.text}. </VisuallyHidden>}
          <span>{caption}</span>
          {view.harmonic && <span className={styles.badge}>12th-fret harmonic</span>}
          {showHz && listening && (
            <span className={styles.hz}>
              <span ref={hzRef} />
              {shownTarget && <span className={styles.hzTarget}> of {formatHz(shownTarget.freq)}</span>}
            </span>
          )}
          {showHz && earTarget && <span className={styles.hz}>{formatHz(earTarget.freq)}</span>}
        </p>
      </div>

      <div className={styles.meterSlot}>
        {ear ? (
          earControls
        ) : display === 'strobe' ? (
          <StrobeMeter session={session} parked={parked}>
            {number}
          </StrobeMeter>
        ) : (
          <NeedleMeter session={session} tolerance={tolerance} parked={parked} reducedMotion={reducedMotion}>
            {number}
          </NeedleMeter>
        )}
      </div>

      <div className={styles.instruction}>
        <span className={styles.instructionIcon} aria-hidden="true">
          <Icon name={icon} size="lg" strokeWidth={2.25} />
        </span>
        <p className={cx(styles.instructionTitle, title.length > LONG_TITLE && styles.titleLong)}>{title}</p>
        <p className={cx(styles.instructionDetail, detailKind === 'warn' && styles.detailWarn)}>
          {detailKind !== 'plain' && <Icon name={detailKind === 'warn' ? 'TriangleAlert' : 'Info'} size="xs" className={styles.detailIcon} />}
          {detail}
        </p>
      </div>

      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {spoken}
        </span>
      </VisuallyHidden>
    </section>
  );
}
