/** What the quick look found, as the screen uses it (`look.ts`), and the messages of the old quick-look worker. */
import type { GrayImage } from '@/core/omr/image/gray';
import type { BBox } from '@/core/omr/types';
import type { PageKind } from '../model/pages';

/** What the quick look found. */
export interface LookResult {
  kind: PageKind;
  /** The classifier's sentence. */
  reason: string;
  textLines: number;
  staves: { kind: 'tab' | 'notation'; lineCount: number; box: BBox; lines: { x: number; y: number }[][] }[];
  barlines: { x: number; y0: number; y1: number }[];
  /** The paper when something else shows around it. */
  paper: BBox | null;
  paperCover: number | null;
  quality: number;
  skew: number;
  staffSpace: number;
  correction: 'none' | 'scale' | 'similarity' | 'mesh';
  /** The reader's flattened, straightened page (reduced), grey. */
  clean: GrayImage | null;
}

/** Screen to worker. */
export type LookRequest = { type: 'look'; id: number; gray: GrayImage };

/** Worker to screen. */
export type LookResponse = { type: 'looked'; id: number; result: LookResult } | { type: 'failed'; id: number; message: string };
