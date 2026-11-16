/**
 * Small pieces shared by the progressions screens: names in the reader's naming system, the
 * keyboard guard, the per-progression memory (key and tempo), the jam settings, and the card a
 * progression is shown on in lists.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TONALITY_NAME, type HomeKey, type Progression } from '@/content/progressions';
import type { BackingStyleId } from '@/core/audio';
import { formatChord, formatNote, formatScaleName, type NoteNaming } from '@/core/theory';
import { Icon, cx, useLocalState } from '@/ui';
import { useMusicSettings } from '@/ui/music';
import { playPreview, previewPlaying, stopPreview } from '../audio/preview';
import { displayName, previewChords } from '../model/browse';
import { DEFAULT_JAM, sanitizeJam, type JamSettings } from '../model/jam';
import styles from './Progressions.module.css';

/** A chord symbol in the reader's naming system (`Bbm7b5` -> `B♭m7♭5`). */
export function chordName(symbol: string, naming: NoteNaming): string {
  try {
    return formatChord(symbol, { system: naming });
  } catch {
    return symbol;
  }
}

/** A tonic in the reader's naming system. */
export function noteName(tonic: string, naming: NoteNaming): string {
  try {
    return formatNote(tonic, { system: naming, octave: false });
  } catch {
    return tonic;
  }
}

/** "G major", "D Dorian", "E Phrygian dominant". */
export function keyName(home: Pick<HomeKey, 'tonic' | 'tonality'>, naming: NoteNaming): string {
  return `${noteName(home.tonic, naming)} ${TONALITY_NAME[home.tonality]}`;
}

/** "A minor pentatonic". */
export function scaleName(tonic: string, scale: string, naming: NoteNaming): string {
  try {
    return formatScaleName(tonic, scale, { system: naming });
  } catch {
    return `${tonic} ${scale}`;
  }
}

/** Is this key press aimed at a control that uses the key itself? */
export function ownsKey(target: EventTarget | null, key: string): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  const tag = el.tagName;
  if (el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Space on the option already chosen (a scale chip just clicked) would do nothing there, so it
  // stays the screen's play / pause.
  if (key === ' ' && el.getAttribute('role') === 'radio' && el.getAttribute('aria-checked') === 'true') return false;
  if ((key === ' ' || key === 'Enter') && (tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'radio')) return true;
  if (key.startsWith('Arrow') && el.closest('[role="radiogroup"], [role="tablist"], [role="slider"], [role="spinbutton"], [role="listbox"], [role="menu"], [data-fretboard-cells]')) return true;
  return false;
}

/** True while a dialog or sheet is open (keys then belong to it). */
export function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

// ── Memory ───────────────────────────────────────────────────────────────────────────────────

/** What is remembered per progression: the last key, tempo and band style. */
export interface Remembered {
  tonic?: string;
  tempo?: number;
  style?: BackingStyleId;
}

const MEMORY_KEY = 'progressions.memory';
const MAX_REMEMBERED = 200;

/** The remembered key/tempo/style of one progression, and a setter that merges. */
export function useRemembered(id: string): [Remembered, (patch: Remembered) => void] {
  const [all, setAll] = useLocalState<Record<string, Remembered>>(MEMORY_KEY, {});
  const mine = useMemo<Remembered>(() => {
    const r = all && typeof all === 'object' ? all[id] : undefined;
    return r && typeof r === 'object' ? r : {};
  }, [all, id]);
  const update = useCallback(
    (patch: Remembered) =>
      setAll((prev) => {
        const base = prev && typeof prev === 'object' ? prev : {};
        const next: Record<string, Remembered> = { ...base, [id]: { ...(base[id] ?? {}), ...patch } };
        const keys = Object.keys(next);
        if (keys.length > MAX_REMEMBERED) delete next[keys[0]];
        return next;
      }),
    [id, setAll],
  );
  return [mine, update];
}

/** The jam settings, kept per device. */
export function useJamSettings(): [JamSettings, (patch: Partial<JamSettings>) => void] {
  const [raw, setRaw] = useLocalState<unknown>('progressions.jam', DEFAULT_JAM);
  const settings = useMemo(() => sanitizeJam(raw), [raw]);
  const update = useCallback((patch: Partial<JamSettings>) => setRaw((prev: unknown) => ({ ...sanitizeJam(prev), ...patch })), [setRaw]);
  return [settings, update];
}

// ── The card ─────────────────────────────────────────────────────────────────────────────────

/** Props for {@link ProgressionCard}. */
export interface ProgressionCardProps {
  progression: Progression;
  /** Key to show and preview in (default: the progression's first key). */
  tonic?: string;
  /** Where the card leads. */
  href: string;
  /** Title (default: the catalog name). */
  title?: string;
  /** Small text under the chords (style, level). */
  meta?: ReactNode;
}

/**
 * A progression in a list: a round button that plays a short strummed preview (the chords light up
 * as they sound) and a link to its page. Two controls side by side, never one inside the other.
 */
export function ProgressionCard({ progression, tonic, href, title, meta }: ProgressionCardProps) {
  const { naming } = useMusicSettings();
  const owner = useRef({});
  const [step, setStep] = useState<number | null>(null);
  const key = tonic ?? progression.keys[0];
  const chords = useMemo(() => {
    try {
      return previewChords(progression, key, { maxChords: 6 });
    } catch {
      return [];
    }
  }, [progression, key]);
  const name = title ?? displayName(progression);
  useEffect(() => () => stopPreview(owner.current), []);
  const playing = step !== null;
  const toggle = () => {
    if (previewPlaying(owner.current)) {
      stopPreview(owner.current);
      return;
    }
    setStep(0);
    void playPreview(owner.current, chords, 112, setStep);
  };
  return (
    <article className={cx(styles.card, playing && styles.cardPlaying)} data-progression-card={progression.id}>
      <button type="button" className={styles.cardPlay} onClick={toggle} aria-pressed={playing} aria-label={playing ? `Stop ${name}` : `Hear ${name}`}>
        <Icon name={playing ? 'Square' : 'Play'} size="sm" />
      </button>
      <a className={styles.cardLink} href={href}>
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardChords} aria-label={`Chords in ${noteName(key, naming)}: ${chords.map((c) => chordName(c.symbol, naming)).join(', ')}`}>
          {chords.map((c, i) => (
            <span key={i} className={cx(styles.cardChord, step === i && styles.cardChordOn)} aria-hidden="true">
              {chordName(c.symbol, naming)}
            </span>
          ))}
        </span>
        {meta != null && <span className={styles.cardMeta}>{meta}</span>}
      </a>
    </article>
  );
}
