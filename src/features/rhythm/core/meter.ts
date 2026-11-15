/**
 * Meters as the rhythm trainer needs them: where the felt beats start, how long they are, and how
 * a tempo given in felt beats per minute turns into seconds per tick.
 */
import { PPQ, parseTimeSignature, type TimeSignature } from '@/core/theory';

/** A meter resolved for layout, counting and timing. */
export interface MeterInfo {
  /** `4/4`, `6/8` ... */
  id: string;
  ts: TimeSignature;
  barTicks: number;
  /** Tick offset of every felt beat from the start of the bar. */
  beatStarts: number[];
  /** Length of every felt beat. */
  beatTicks: number[];
  /** The beat a tempo number counts: a dotted quarter in compound time, a quarter otherwise. */
  tempoBeatTicks: number;
  /** True when beats divide in three (6/8, 12/8). */
  compound: boolean;
}

const cache = new Map<string, MeterInfo>();

/** Resolve a time signature. Throws on text that is not one: meters here are authored, never typed by the learner. */
export function meterInfo(id: string): MeterInfo {
  const hit = cache.get(id);
  if (hit) return hit;
  const ts = parseTimeSignature(id);
  if (!ts) throw new RangeError(`Not a time signature: "${id}"`);
  const beatStarts: number[] = [];
  let at = 0;
  for (const len of ts.beatTicks) {
    beatStarts.push(at);
    at += len;
  }
  const compound = ts.kind === 'compound';
  const info: MeterInfo = {
    id: ts.text,
    ts,
    barTicks: ts.barTicks,
    beatStarts,
    beatTicks: [...ts.beatTicks],
    tempoBeatTicks: compound ? (PPQ * 3) / 2 : PPQ,
    compound,
  };
  cache.set(id, info);
  return info;
}

/** Seconds one tick lasts at `bpm` felt beats per minute. */
export function secondsPerTick(bpm: number, meter: MeterInfo): number {
  return 60 / (Math.max(1, bpm) * meter.tempoBeatTicks);
}

/** The same tempo as quarter notes per minute (what the audio transport counts). */
export function quarterBpm(bpm: number, meter: MeterInfo): number {
  return (bpm * meter.tempoBeatTicks) / PPQ;
}

/** Index of the felt beat a tick inside a bar belongs to. */
export function beatIndexAt(tickInBar: number, meter: MeterInfo): number {
  let beat = 0;
  for (let i = 0; i < meter.beatStarts.length; i++) if (tickInBar >= meter.beatStarts[i]) beat = i;
  return beat;
}
