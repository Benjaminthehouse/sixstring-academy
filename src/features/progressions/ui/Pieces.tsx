/**
 * Building blocks of the progression page and the jam: the key picker, the bar-by-bar chart and
 * the row of chord shapes. All of them can play what they show.
 */
import { useState } from 'react';
import type { Progression, ResolvedChord } from '@/content/progressions';
import type { NoteNaming } from '@/core/theory';
import { Button, Chip, Sheet, Text, cx } from '@/ui';
import { ChordDiagram } from '@/ui/music';
import { formatSlot } from '@/content/progressions';
import { keyOptions } from '../model/keys';
import type { ChartLine, ChordCard } from '../model/page';
import type { ChartPos } from '../model/jam';
import { chordName, noteName } from './shared';
import styles from './Progressions.module.css';

// ── Key picker ───────────────────────────────────────────────────────────────────────────────

/** Props for {@link KeyPicker}. */
export interface KeyPickerProps {
  progression: Progression;
  tonic: string;
  onChange: (tonic: string) => void;
  naming: NoteNaming;
  /** Accessible name of the group (default "Key"). */
  label?: string;
}

/**
 * The guitar-friendly keys as chips, the current key even when it is not one of them, and "More
 * keys" for all twelve in a sheet (the friendly ones marked "easy on guitar").
 */
export function KeyPicker({ progression, tonic, onChange, naming, label = 'Key' }: KeyPickerProps) {
  const [open, setOpen] = useState(false);
  const { friendly, all } = keyOptions(progression);
  const isFriendly = friendly.some((k) => k.tonic === tonic);
  return (
    <div className={styles.keyRow} role="group" aria-label={label} data-key-picker>
      {friendly.map((k) => (
        <Chip key={k.tonic} selected={k.tonic === tonic} onClick={() => onChange(k.tonic)} aria-label={`Key of ${noteName(k.tonic, naming)}`}>
          {noteName(k.tonic, naming)}
        </Chip>
      ))}
      {!isFriendly && (
        <Chip selected onClick={() => setOpen(true)} aria-label={`Key of ${noteName(tonic, naming)}`}>
          {noteName(tonic, naming)}
        </Chip>
      )}
      <Button variant="ghost" size="sm" iconRight="ChevronDown" onClick={() => setOpen(true)}>
        More keys
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose a key" description="Every key works with the band. The marked ones are easiest with open chords." size="sm">
        <div className={styles.keyGrid} role="group" aria-label="All keys">
          {all.map((k) => (
            <Chip
              key={k.pc}
              className={styles.keyGridItem}
              selected={k.tonic === tonic}
              data-autofocus={k.tonic === tonic ? '' : undefined}
              aria-label={`Key of ${noteName(k.tonic, naming)}${k.friendly ? ', easy on guitar' : ''}`}
              onClick={() => {
                onChange(k.tonic);
                setOpen(false);
              }}
            >
              <span>{noteName(k.tonic, naming)}</span>
              {k.friendly && <span className={styles.keyEasy}>easy</span>}
            </Chip>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────────────────────────────────────

/** Props for {@link Chart}. */
export interface ChartProps {
  lines: ChartLine[];
  naming: NoteNaming;
  /** The chord sounding now, lit in accent. */
  now?: ChartPos | null;
  /** Tap a chord: strum it (or whatever the screen wants). */
  onTap?: (chord: ResolvedChord, pos: ChartPos) => void;
  /** Numerals on top (default) or chords only. */
  numerals?: boolean;
  className?: string;
}

/** The chart, bar by bar, four bars a line, a section label on the line where it starts. */
export function Chart({ lines, naming, now, onTap, numerals = true, className }: ChartProps) {
  return (
    <div className={cx(styles.chart, className)} data-chart>
      {lines.map((line, li) => (
        <div key={li} className={styles.chartLine}>
          {line.label && <span className={styles.chartLabel}>{line.label}</span>}
          <div className={styles.chartBars} role="list" aria-label={line.label ? `Section ${line.label}` : `Bars ${line.bars[0].index + 1} to ${line.bars[line.bars.length - 1].index + 1}`}>
            {line.bars.map((bar) => (
              <div key={bar.index} role="listitem" className={cx(styles.bar, bar.chords.length > 1 && styles.split, now?.bar === bar.index && styles.barNow)} data-bar={bar.index}>
                {bar.chords.map((c, i) => {
                  const lit = now?.bar === bar.index && now.index === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cx(styles.slot, lit && styles.slotNow)}
                      data-slot={`${bar.index}:${i}`}
                      data-now={lit ? 'true' : undefined}
                      aria-current={lit ? 'true' : undefined}
                      aria-label={`Bar ${bar.index + 1}: ${chordName(c.symbol, naming)}, ${formatSlot(c.token)}${bar.chords.length > 1 ? `, ${c.beats} beats` : ''}`}
                      onClick={() => onTap?.(c, { bar: bar.index, index: i })}
                    >
                      {numerals && <span className={styles.numeral}>{formatSlot(c.token)}</span>}
                      <span className={styles.chordSym}>{chordName(c.symbol, naming)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - line.bars.length) }, (_, i) => (
              <div key={`pad-${i}`} className={styles.bar} aria-hidden="true" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Chord shapes ─────────────────────────────────────────────────────────────────────────────

/** Props for {@link ChordShapes}. */
export interface ChordShapesProps {
  chords: ChordCard[];
  naming: NoteNaming;
  /** Symbol of the chord sounding now. */
  now?: string | null;
  onTap?: (card: ChordCard) => void;
  capo?: number;
}

/** One diagram per chord, in order of first appearance; tap one to hear it. */
export function ChordShapes({ chords, naming, now, onTap, capo = 0 }: ChordShapesProps) {
  return (
    <div className={styles.shapes} data-shapes>
      {chords.map((c) => (
        <button
          key={c.symbol}
          type="button"
          className={cx(styles.shape, now === c.symbol && styles.shapeNow)}
          onClick={() => onTap?.(c)}
          aria-label={`Hear ${chordName(c.symbol, naming)}${c.shape ? `, played as a ${chordName(c.shape, naming)} shape with capo ${capo}` : ''}`}
          data-shape={c.symbol}
        >
          <span className={styles.shapeDiagram} aria-hidden="true">
            {c.voicing ? <ChordDiagram voicing={c.voicing} size="sm" title={chordName(c.symbol, naming)} /> : <Text size="lg">{chordName(c.symbol, naming)}</Text>}
          </span>
          <span className={styles.shapeLabel}>
            <span className={styles.shapeNumeral}>{formatSlot(c.token)}</span>
            {c.shape && <span>{chordName(c.shape, naming)} shape</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
