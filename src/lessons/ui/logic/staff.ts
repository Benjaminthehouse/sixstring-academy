/**
 * The small staff the staff exercises draw themselves (so the note can be placed by touch):
 * geometry, the names of staff positions, and the music glyphs (clef, accidentals, note head)
 * as SVG paths. The glyph outlines are Bravura's (SIL Open Font License), the same font the
 * shared notation view engraves with, copied from VexFlow's bundled glyph table.
 */

/** Outlines in VexFlow's compact form: `m x y`, `l x y`, `b x y c1x c1y c2x c2y` (end point first), `z`. */
const OUTLINES = {
  gClef: 'm 541 598 b 550 625 539 615 541 616 b 824 1174 706 770 824 953 b 730 1509 824 1299 789 1423 b 655 1581 708 1541 671 1581 b 562 1512 635 1581 590 1544 b 420 1064 455 1394 420 1214 b 441 828 420 981 431 887 b 428 793 444 811 445 808 b 0 125 220 622 0 416 b 524 -363 0 -125 171 -363 b 624 -354 557 -363 595 -360 b 645 -367 639 -351 642 -350 b 684 -657 662 -464 684 -589 b 455 -896 684 -870 540 -896 b 340 -854 377 -896 340 -873 b 386 -829 340 -844 353 -840 b 482 -694 431 -816 482 -778 b 344 -547 482 -615 432 -547 b 190 -713 248 -547 190 -624 b 464 -948 190 -806 246 -948 b 747 -660 560 -948 747 -904 b 706 -351 747 -577 721 -441 b 724 -327 703 -334 704 -336 b 966 16 870 -269 966 -147 b 619 363 966 200 831 363 b 577 389 582 363 582 363 z m 677 1358 b 763 1240 724 1358 763 1319 b 513 851 763 1080 626 950 b 494 863 503 842 497 844 b 485 995 488 900 485 949 b 677 1358 485 1220 589 1358 z m 520 377 b 498 343 524 350 524 351 b 289 63 372 300 289 186 b 455 -192 289 -66 357 -158 b 494 -200 467 -196 484 -200 b 511 -184 505 -200 511 -193 b 490 -166 511 -174 500 -170 b 386 -12 429 -140 386 -78 b 530 157 386 71 442 132 b 559 145 553 163 556 161 l 631 -284 b 611 -304 634 -300 632 -300 b 530 -311 588 -308 559 -311 b 115 29 278 -311 115 -171 b 249 363 115 114 130 228 b 469 567 336 459 402 513 b 490 562 484 579 487 577 z m 619 148 b 635 168 616 166 618 170 b 848 -66 752 158 848 60 b 713 -271 848 -157 793 -230 b 690 -262 696 -279 693 -279 z',
  fClef: 'm 363 377 b 0 56 112 377 0 194 b 177 -158 0 -59 60 -158 b 330 -6 268 -158 330 -95 b 192 144 330 86 262 144 b 120 134 153 144 138 134 b 96 160 101 134 96 145 b 330 323 96 217 183 323 b 549 -53 482 323 549 173 b 14 -871 549 -455 350 -680 b -7 -897 1 -878 -7 -886 b 12 -914 -7 -906 -1 -914 b 36 -907 19 -914 27 -912 b 765 -40 390 -734 765 -478 b 363 377 765 210 612 377 z m 906 259 b 827 180 861 259 827 225 b 906 101 827 135 861 101 b 985 180 950 101 985 135 b 906 259 985 225 950 259 z m 907 -102 b 829 -180 863 -102 829 -135 b 907 -258 829 -225 863 -258 b 985 -180 952 -258 985 -225 b 907 -102 985 -135 952 -102 z',
  sharp: 'm 341 170 b 359 194 351 174 359 186 l 359 297 b 348 308 359 304 354 308 b 341 307 346 308 344 308 b 305 294 341 307 312 295 b 285 312 295 294 285 301 l 285 488 b 265 504 285 497 276 504 b 242 488 251 504 242 497 l 242 301 b 223 259 240 287 236 268 b 132 223 206 249 157 229 b 115 252 120 223 115 240 l 115 425 b 95 441 115 433 105 441 b 72 425 81 441 72 433 l 72 230 b 55 192 72 210 63 196 b 17 176 46 187 17 176 b 0 153 7 173 0 161 l 0 50 b 13 37 0 42 4 37 l 16 39 b 50 53 17 39 39 48 l 52 55 b 72 29 63 55 72 40 l 72 -114 b 56 -147 72 -130 65 -143 b 17 -163 48 -150 17 -163 b 0 -186 7 -166 0 -177 l 0 -288 b 13 -301 0 -297 4 -301 l 16 -300 b 50 -287 17 -300 37 -291 b 55 -285 52 -285 53 -285 b 72 -308 65 -285 72 -301 l 72 -485 b 91 -501 72 -494 81 -501 b 115 -485 105 -501 115 -494 l 115 -285 b 130 -253 115 -266 122 -256 l 217 -217 b 219 -217 217 -217 219 -217 l 222 -216 b 242 -242 235 -216 242 -233 l 242 -422 b 261 -438 242 -431 251 -438 b 285 -422 276 -438 285 -431 l 285 -217 b 301 -184 285 -206 291 -189 b 341 -168 311 -180 341 -168 b 359 -144 351 -164 359 -153 l 359 -42 b 348 -30 359 -35 354 -30 b 341 -32 346 -30 344 -30 l 304 -46 b 285 -20 295 -46 285 -37 l 285 114 b 304 156 285 124 292 151 z m 242 -65 b 132 -122 233 -94 166 -122 b 115 -115 124 -122 117 -120 b 111 -43 112 -109 111 -78 b 115 63 111 1 112 52 b 220 118 118 88 184 118 b 242 109 230 118 239 115 b 248 27 245 102 248 66 b 242 -65 248 -12 245 -52 z',
  flat: 'm 17 -245 b 30 -252 22 -251 26 -252 b 39 -249 35 -252 39 -249 b 153 -161 82 -225 117 -186 b 325 82 281 -72 325 16 b 196 220 325 164 262 216 b 117 196 171 220 137 209 b 85 176 108 189 92 176 b 78 177 82 176 81 176 b 62 202 68 181 62 192 b 72 608 63 233 72 579 b 45 632 72 624 59 632 b 0 592 24 632 1 618 b 17 -245 0 592 6 -230 z m 68 -117 b 63 27 68 -117 63 -30 b 66 73 63 50 65 68 b 167 144 76 102 134 144 b 226 60 209 144 226 96 b 98 -134 226 -17 160 -95 b 84 -138 92 -137 88 -138 b 68 -117 71 -138 68 -124 z',
  natural: 'm 203 261 b 197 259 200 261 199 259 b 68 226 197 259 105 226 b 53 233 59 226 53 228 l 53 474 b 36 491 53 484 45 491 l 17 491 b 0 474 7 491 0 484 l 0 -268 b 13 -281 0 -276 4 -281 l 16 -279 b 22 -278 17 -279 20 -279 b 164 -235 42 -269 122 -235 b 189 -251 179 -235 189 -239 l 189 -465 b 206 -482 189 -475 196 -482 l 225 -482 b 242 -465 233 -482 242 -475 l 242 258 b 230 269 242 265 236 269 b 225 268 229 269 226 269 z m 53 56 b 176 114 53 76 141 114 b 189 107 184 114 189 112 l 189 -42 b 71 -101 189 -68 107 -101 b 53 -92 60 -101 53 -98 z',
  wholeNote: 'm 311 180 b 0 3 120 180 0 101 b 297 -180 0 -94 82 -180 b 608 3 533 -180 608 -98 b 311 180 608 105 445 180 z m 160 91 b 274 148 176 141 229 148 b 452 -45 373 148 452 42 b 386 -141 452 -89 433 -130 b 341 -147 372 -145 356 -147 b 206 -72 289 -147 236 -112 b 156 56 177 -39 156 10 b 160 91 156 68 157 79 z',
} as const;

/** A glyph name. */
export type GlyphName = keyof typeof OUTLINES;

/** Width of each glyph in staff spaces (from its outline). */
export const GLYPH_WIDTH: Record<GlyphName, number> = { gClef: 2.68, fClef: 2.74, sharp: 1.0, flat: 0.9, natural: 0.67, wholeNote: 1.69 };

/** Outline units per staff space. */
const UNITS_PER_SPACE = 360;

/**
 * SVG path data of a glyph with its origin at (x, y), sized for staff lines `space` units apart.
 * Font outlines point up; SVG points down, so y is flipped.
 */
export function glyphPath(name: GlyphName, x: number, y: number, space: number): string {
  const s = space / UNITS_PER_SPACE;
  const t = OUTLINES[name].split(' ');
  const px = (v: string): string => String(Math.round((x + Number(v) * s) * 100) / 100);
  const py = (v: string): string => String(Math.round((y - Number(v) * s) * 100) / 100);
  const out: string[] = [];
  for (let i = 0; i < t.length; ) {
    const op = t[i++];
    if (op === 'm' || op === 'l') {
      out.push(`${op === 'm' ? 'M' : 'L'}${px(t[i])} ${py(t[i + 1])}`);
      i += 2;
    } else if (op === 'b') {
      const [ex, ey, c1x, c1y, c2x, c2y] = t.slice(i, i + 6);
      out.push(`C${px(c1x)} ${py(c1y)} ${px(c2x)} ${py(c2y)} ${px(ex)} ${py(ey)}`);
      i += 6;
    } else if (op === 'q') {
      const [ex, ey, cx, cy] = t.slice(i, i + 4);
      out.push(`Q${px(cx)} ${py(cy)} ${px(ex)} ${py(ey)}`);
      i += 4;
    } else if (op === 'z') {
      out.push('Z');
    }
  }
  return out.join(' ');
}

/** The ledger lines a note at `position` needs (0 = bottom line, 8 = top line). */
export function ledgerLines(position: number): number[] {
  const out: number[] = [];
  for (let p = -2; p >= position; p -= 2) out.push(p);
  for (let p = 10; p <= position; p += 2) out.push(p);
  return out;
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/**
 * The name of a staff position in plain words, as a noun phrase that reads after "on the": "2nd
 * line", "space above the staff", "2nd ledger line below the staff", "space below the 1st ledger
 * line". Every position above and below the staff has one.
 */
export function staffPositionName(position: number): string {
  if (position >= 0 && position <= 8) {
    const n = Math.floor(position / 2);
    if (position % 2 === 0) return position === 0 ? 'bottom line' : position === 8 ? 'top line' : `${ORD[n]} line`;
    return `${ORD[n]} space`;
  }
  if (position === 9) return 'space above the staff';
  if (position === -1) return 'space below the staff';
  if (position > 9) {
    const ledger = Math.floor((position - 8) / 2);
    const name = `${ORD[ledger - 1] ?? `${ledger}th`} ledger line`;
    return position % 2 === 0 ? `${name} above the staff` : `space above the ${name}`;
  }
  const ledger = Math.floor(-position / 2);
  const name = `${ORD[ledger - 1] ?? `${ledger}th`} ledger line`;
  return position % 2 === 0 ? `${name} below the staff` : `space below the ${name}`;
}

/** The staff position under a point, from its y (in the drawing's units), clamped to a range. */
export function positionAtY(y: number, top: number, maxPosition: number, step: number, range: readonly [number, number]): number {
  const p = Math.round(maxPosition - (y - top) / step);
  return Math.min(range[1], Math.max(range[0], p));
}
