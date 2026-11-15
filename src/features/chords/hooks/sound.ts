/**
 * Making a chord sound: a strum, or the notes one by one. Called from click and key handlers (the
 * play functions unlock audio themselves), in the learner's chosen guitar tone.
 */
import { audioNow, normalizeTone, pluck, stopAll, strum } from '@/core/audio';
import type { Voicing } from '@/core/guitar';
import { soundPrefs } from '@/core/settings';

function tone() {
  return normalizeTone(soundPrefs().guitarTone, 'steel');
}

/** Strum a voicing, low string first (down) or high first (up). */
export function strumVoicing(v: Voicing, direction: 'down' | 'up' = 'down'): void {
  const notes = [...v.notes].sort((a, b) => b.string - a.string);
  strum(
    notes.map((n) => n.midi),
    undefined,
    { direction, tone: tone(), velocity: 0.8, strings: notes.map((n) => n.string), spread: direction === 'down' ? 0.03 : 0.022 },
  );
}

/** Play the notes of a voicing one at a time, low to high, and let them ring together. */
export function arpeggiateVoicing(v: Voicing, gap = 0.26): number {
  const notes = [...v.notes].sort((a, b) => b.string - a.string);
  const t0 = audioNow() + 0.05;
  notes.forEach((n, i) => pluck(n.midi, t0 + i * gap, { string: n.string, tone: tone(), velocity: 0.7, duration: 2.2 }));
  return notes.length * gap + 1;
}

/** Strum a list of voicings one after another (a progression example), `beat` seconds apart. */
export function strumSequence(voicings: readonly Voicing[], beat = 1.1): void {
  const t0 = audioNow() + 0.05;
  voicings.forEach((v, i) => {
    const notes = [...v.notes].sort((a, b) => b.string - a.string);
    strum(
      notes.map((n) => n.midi),
      t0 + i * beat,
      { direction: 'down', tone: tone(), velocity: 0.75, strings: notes.map((n) => n.string) },
    );
  });
}

/** Silence everything this screen started. */
export function silence(): void {
  stopAll();
}
