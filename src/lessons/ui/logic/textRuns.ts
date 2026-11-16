/**
 * Where lesson text may break across lines. A tappable glossary term is drawn as its own box, so
 * a browser would happily wrap the comma after it onto the next line by itself; and "10-8-8" or
 * "x-3-2-0-1-0" break at their hyphens. This groups the tokens of a text into runs: single tokens
 * that may wrap as usual, and "keep" runs that must stay on one line.
 */
import type { TextToken } from '../../text';

/** A piece of text to render: one token as usual, or tokens that must stay on one line. */
export type TextRun = { kind: 'token'; token: TextToken } | { kind: 'keep'; tokens: TextToken[] };

/** Closing punctuation that belongs to the word before it. */
const CLOSE = /^[.,;:!?…)\]}”’"'%]+/;
/** Opening punctuation that belongs to the word after it. */
const OPEN = /[([{“‘"']+$/;
/** Numbers (or muted strings) joined by hyphens: "10-8-8", "x-3-2-0-1-0", "3–5". */
const HYPHEN_RUN = /(?<![A-Za-z0-9])[0-9xX]+(?:[-–‑][0-9xX]+)+(?![A-Za-z0-9])/g;

type TextPiece = Extract<TextToken, { type: 'text' }>;

function isWord(t: TextToken | undefined): boolean {
  return !!t && t.type !== 'text' && t.type !== 'break' && t.type !== 'blank';
}

function textPiece(from: TextPiece, text: string): TextPiece {
  return { ...from, text, say: text };
}

/** Group the tokens of a text into runs that wrap normally and runs that must not break. */
export function textRuns(tokens: readonly TextToken[]): TextRun[] {
  // 1. Split text tokens around hyphenated number runs (each such run is kept whole).
  const pieces: TextToken[] = [];
  const keep: boolean[] = [];
  for (const token of tokens) {
    if (token.type !== 'text') {
      pieces.push(token);
      keep.push(false);
      continue;
    }
    let last = 0;
    for (const m of token.text.matchAll(HYPHEN_RUN)) {
      const at = m.index ?? 0;
      if (at > last) {
        pieces.push(textPiece(token, token.text.slice(last, at)));
        keep.push(false);
      }
      pieces.push(textPiece(token, m[0]));
      keep.push(true);
      last = at + m[0].length;
    }
    if (last < token.text.length) {
      pieces.push(textPiece(token, token.text.slice(last)));
      keep.push(false);
    }
  }

  // 2. Peel punctuation off the text beside a term or symbol, and glue it to that word.
  const out: TextToken[] = [];
  const outKeep: boolean[] = [];
  const glue: boolean[] = []; // glue[i]: out[i] and out[i + 1] stay together
  const push = (t: TextToken, k: boolean, glued: boolean): void => {
    out.push(t);
    outKeep.push(k);
    glue.push(false);
    if (glued && out.length > 1) glue[out.length - 2] = true;
  };
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece.type !== 'text' || keep[i]) {
      // A hyphen run straight after a word stays with it ("strings 6-5" is plain text anyway).
      push(piece, keep[i], false);
      continue;
    }
    let text = piece.text;
    let lead = '';
    let tail = '';
    if (isWord(pieces[i - 1])) {
      const m = CLOSE.exec(text);
      if (m) {
        lead = m[0];
        text = text.slice(lead.length);
      }
    }
    if (isWord(pieces[i + 1])) {
      const m = OPEN.exec(text);
      if (m) {
        tail = m[0];
        text = text.slice(0, text.length - tail.length);
      }
    }
    if (lead) push(textPiece(piece, lead), false, true);
    if (text) push(textPiece(piece, text), false, false);
    if (tail) push(textPiece(piece, tail), false, false);
    if (tail && i + 1 < pieces.length) glue[out.length - 1] = true;
  }

  // 3. Runs: glued neighbours and kept pieces become one unbreakable run.
  const runs: TextRun[] = [];
  for (let i = 0; i < out.length; i++) {
    if (!outKeep[i] && !glue[i] && !(i > 0 && glue[i - 1])) {
      runs.push({ kind: 'token', token: out[i] });
      continue;
    }
    const group: TextToken[] = [out[i]];
    while (glue[i] && i + 1 < out.length) group.push(out[++i]);
    runs.push({ kind: 'keep', tokens: group });
  }
  return runs;
}
