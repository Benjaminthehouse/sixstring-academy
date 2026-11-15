/** A value accepted by `cx()`: strings, falsy values, `{ className: condition }` maps and nested arrays. */
export type ClassValue = string | number | false | null | undefined | { [className: string]: boolean | null | undefined } | ClassValue[];

/** Join class names, skipping falsy parts: `cx(styles.btn, active && styles.active, { [styles.big]: big })`. */
export function cx(...parts: ClassValue[]): string {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    let piece = '';
    if (typeof part === 'string') piece = part;
    else if (typeof part === 'number') piece = String(part);
    else if (Array.isArray(part)) piece = cx(...part);
    else {
      for (const key in part) {
        if (part[key]) piece += (piece ? ' ' : '') + key;
      }
    }
    if (piece) out += (out ? ' ' : '') + piece;
  }
  return out;
}
