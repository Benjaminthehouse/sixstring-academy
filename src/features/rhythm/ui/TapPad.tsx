import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, Kbd, cx, useIsTouch } from '@/ui';
import styles from './Rhythm.module.css';

/** How the pad is split. `strum`: left is a downstroke, right an upstroke. `hands`: two equal pads for fast notes. */
export type PadMode = 'single' | 'hands' | 'strum';

/** Props of {@link TapPad}. */
export interface TapPadProps {
  mode?: PadMode;
  /** Called on pointer down with the DOM event (its timestamp is the tap time). */
  onTap: (event: { timeStamp: number }, dir?: 'D' | 'U') => void;
  disabled?: boolean;
  /** Word on a single pad (default "Tap"). */
  label?: string;
}

/**
 * The big tap target. It reacts on pointer *down* (a click fires on release, tens of milliseconds
 * late) and flashes at once, so every tap is answered before the judgement arrives.
 */
export function TapPad({ mode = 'single', onTap, disabled, label = 'Tap' }: TapPadProps) {
  const touch = useIsTouch();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const press = useCallback(
    (index: number, dir: 'D' | 'U' | undefined) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // Keep focus where it is and stop the browser from turning a fast double tap into a zoom.
      e.preventDefault();
      onTap(e.nativeEvent, dir);
      const el = refs.current[index];
      if (el) {
        el.dataset.hit = '0';
        // Reading layout restarts the flash even when taps come faster than it fades.
        void el.offsetWidth;
        el.dataset.hit = '1';
      }
    },
    [disabled, onTap],
  );

  const pad = (index: number, dir: 'D' | 'U' | undefined, text: string, key: string, icon?: string) => (
    <button
      key={index}
      ref={(el) => {
        refs.current[index] = el;
      }}
      type="button"
      className={cx(styles.pad, dir === 'U' && styles.padUp)}
      disabled={disabled}
      onPointerDown={press(index, dir)}
      // Keyboard users tap with Space, F and J (handled for the whole screen); Enter on the pad works too.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.repeat) onTap(e.nativeEvent, dir);
      }}
      aria-label={dir === 'D' ? 'Downstroke' : dir === 'U' ? 'Upstroke' : text}
      data-pad={dir ?? 'tap'}
    >
      {icon && <Icon name={icon} size={28} strokeWidth={2.25} />}
      <span className={styles.padLabel}>{text}</span>
      {!touch && (
        <span className={styles.padKey}>
          <Kbd>{key}</Kbd>
        </span>
      )}
    </button>
  );

  return (
    <div className={cx(styles.pads, mode !== 'single' && styles.padsSplit)} data-rhythm-pad>
      {mode === 'single' && pad(0, undefined, label, 'Space')}
      {mode === 'hands' && [pad(0, undefined, 'Left', 'F'), pad(1, undefined, 'Right', 'J')]}
      {mode === 'strum' && [pad(0, 'D', 'Down', 'F', 'ArrowDown'), pad(1, 'U', 'Up', 'J', 'ArrowUp')]}
    </div>
  );
}
