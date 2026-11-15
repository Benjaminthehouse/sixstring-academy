/** The parts of a File that `matchesAccept` looks at (so tests do not need real File objects). */
export interface FileLike {
  name: string;
  type: string;
  size?: number;
}

/**
 * Does a file satisfy an `<input accept>` string? Supports extensions (".pdf"), exact MIME types
 * ("application/pdf") and wildcards ("image/*"). An empty accept matches everything.
 */
export function matchesAccept(file: FileLike, accept: string | undefined): boolean {
  if (!accept) return true;
  const rules = accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** Split dropped files into the ones that pass `accept` / `maxBytes` and the ones that do not. */
export function partitionFiles<T extends FileLike>(files: T[], accept: string | undefined, maxBytes?: number): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const file of files) {
    const tooBig = maxBytes != null && file.size != null && file.size > maxBytes;
    if (!tooBig && matchesAccept(file, accept)) accepted.push(file);
    else rejected.push(file);
  }
  return { accepted, rejected };
}

/** Human file size: 980 B, 12.4 kB, 3.1 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} kB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}
