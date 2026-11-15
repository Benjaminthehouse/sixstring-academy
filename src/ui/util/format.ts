/** Compact count for chips: 950 -> "950", 1250 -> "1.2k", 12500 -> "12k", 1500000 -> "1.5M". */
export function formatCount(value: number): string {
  const n = Math.round(value);
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const units: Array<[number, string]> = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = n / size;
      // One decimal below 10 (1.2k), none above (12k); truncate so 1999 never reads "2.0k".
      const text = Math.abs(scaled) < 10 ? (Math.trunc(scaled * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.trunc(scaled));
      return text + suffix;
    }
  }
  return String(n);
}

/** Whole number with locale-neutral thousands separators (12 345 style thin gaps are avoided: uses commas). */
export function formatInt(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Seconds as m:ss (or h:mm:ss past an hour). Negative values clamp to 0:00. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Up to two initials from a name: "Mia Brooks" -> "MB", "Prof. Elena Varga" -> "EV", "dev" -> "D". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(prof|dr|mr|mrs|ms)\.?$/i.test(w));
  if (words.length === 0) return '';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Stable small hash of a string, for picking a colour slot from a name. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
