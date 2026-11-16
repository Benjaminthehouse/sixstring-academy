/**
 * The built-in song collection, checked song by song. Every failure names the file to fix:
 * `hot-cross-buns/song.sixtab: line 12, column 7: ...` or `hot-cross-buns/meta.ts: level ...`.
 * README.md describes the rules these checks enforce.
 */
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenSong, formatSixTabError, parseSixTab, validateSong, type Song } from '@/core/song';
import { keyModeName, parseKey } from '@/core/theory';
import plan from '@/content/plan/repertoire.json';
import { SONG_ENTRIES, loadSongText, songEntry, songTextIds } from './index';
import { SONG_KINDS, SONG_SKILLS, SONG_STYLES, type SongEntry } from './types';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_FILES = new Set(['meta.ts', 'song.sixtab']);

interface PlanItem {
  id: string;
  level: number;
  key?: string;
}
const PLAN = new Map<string, PlanItem>(
  [...(plan as { pieces: PlanItem[]; studies: PlanItem[] }).pieces, ...(plan as { studies: PlanItem[] }).studies].map((p) => [p.id, p]),
);

/** Folders on disk (one per song). */
const folders = readdirSync(HERE).filter((name) => statSync(HERE + name).isDirectory()).sort();

/** "G" / "G major" / "Gmaj" -> "G major", "A Dorian" -> "A dorian"; null when unreadable. */
function keyName(text: string | undefined): string | null {
  if (!text) return null;
  const k = parseKey(text);
  return k ? `${k.tonic} ${keyModeName(k)}` : null;
}

/** Parse a registered song's text, failing with every error and its position. */
async function parsed(id: string): Promise<Song> {
  const text = await loadSongText(id);
  const result = parseSixTab(text);
  if (!result.song || result.errors.length) {
    throw new Error(`${id}/song.sixtab has ${result.errors.length} error(s):\n${result.errors.map((e) => `  ${id}/song.sixtab: ${formatSixTabError(e)}`).join('\n')}`);
  }
  return result.song;
}

describe('the song folders', () => {
  it('has at least the five seed songs', () => {
    expect(SONG_ENTRIES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(folders)('%s/ holds exactly meta.ts and song.sixtab', (folder) => {
    const files = readdirSync(HERE + folder).filter((f) => !f.startsWith('.'));
    const missing = [...ALLOWED_FILES].filter((f) => !files.includes(f));
    const extra = files.filter((f) => !ALLOWED_FILES.has(f));
    expect(missing, `${folder}/ is missing ${missing.join(' and ')}`).toEqual([]);
    expect(extra, `${folder}/ has files the registry ignores: ${extra.join(', ')} (only meta.ts and song.sixtab belong here)`).toEqual([]);
  });

  it.each(folders)('%s is a valid song id', (folder) => {
    expect(SLUG.test(folder), `${folder}/: the folder name is the song id; use lowercase letters, digits and single hyphens`).toBe(true);
    expect(folder.startsWith('my-'), `${folder}/: ids starting with "my-" are reserved for the learner's own songs`).toBe(false);
    expect(folder.length <= 60, `${folder}/: keep the id under 60 characters`).toBe(true);
  });

  it('registers every folder, and nothing else', () => {
    expect(SONG_ENTRIES.map((e) => e.id).sort()).toEqual(folders);
    expect(songTextIds()).toEqual(folders);
  });

  it('has no two songs with the same title', () => {
    const seen = new Map<string, string>();
    for (const e of SONG_ENTRIES) {
      const key = e.title.toLowerCase();
      expect(seen.has(key), `${e.id}/meta.ts: the title "${e.title}" is already used by ${seen.get(key)}/`).toBe(false);
      seen.set(key, e.id);
    }
  });
});

describe.each(SONG_ENTRIES.map((e) => [e.id, e] as [string, SongEntry]))('%s', (id, entry) => {
  const meta = `${id}/meta.ts`;
  const file = `${id}/song.sixtab`;

  it('song.sixtab parses without errors or warnings', async () => {
    const text = await loadSongText(id);
    const result = parseSixTab(text);
    expect(result.errors.map((e) => `${file}: ${formatSixTabError(e)}`)).toEqual([]);
    expect(result.warnings.map((e) => `${file}: ${formatSixTabError(e)}`)).toEqual([]);
  });

  it('song.sixtab is a valid song (validateSong reports nothing)', async () => {
    const song = await parsed(id);
    expect(validateSong(song).map((i) => `${file}: ${i.level}: ${i.message}`)).toEqual([]);
  });

  it('song.sixtab agrees with meta.ts', async () => {
    const song = await parsed(id);
    expect(song.meta.title, `${file}: "title:" must be exactly the title in meta.ts ("${entry.title}")`).toBe(entry.title);
    if (/^\s*id\s*:/m.test(await loadSongText(id))) expect(song.meta.id, `${file}: "id:" must be the folder name "${id}" (or leave it out)`).toBe(id);
    expect(song.meta.difficulty, `${file}: write "difficulty: ${entry.level}" (the level in meta.ts)`).toBe(entry.level);
    expect(keyName(song.key), `${file}: "key:" must name the same key as meta.ts ("${entry.key}")`).toBe(keyName(entry.key));
    expect(song.meta.licence?.trim(), `${file}: add a "licence:" line (for example "Public domain (traditional)")`).toBeTruthy();
    expect(song.meta.composer?.trim(), `${file}: add a "composer:" line`).toBeTruthy();
  });

  it('meta.ts is complete', () => {
    expect(entry.title.trim(), `${meta}: title is empty`).not.toBe('');
    expect(entry.composer.trim(), `${meta}: composer is empty (use the tradition for anonymous music: "Traditional English")`).not.toBe('');
    expect(entry.publicDomain.trim().length, `${meta}: publicDomain must say why the music (and any words) are free to use`).toBeGreaterThan(20);
    expect(Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 10, `${meta}: level must be a whole number from 1 to 10`).toBe(true);
    expect(SONG_STYLES as readonly string[], `${meta}: style "${entry.style}" is not one of ${SONG_STYLES.join(', ')}`).toContain(entry.style);
    expect(SONG_KINDS as readonly string[], `${meta}: kind "${entry.kind}" is not one of ${SONG_KINDS.join(', ')}`).toContain(entry.kind);
    expect(keyName(entry.key), `${meta}: key "${entry.key}" is not a key name like "G major" or "A minor"`).not.toBeNull();
    expect(entry.teaches.length >= 1 && entry.teaches.length <= 5, `${meta}: teaches needs one to five short phrases`).toBe(true);
    for (const t of entry.teaches) expect(t.trim().length > 2 && t.length <= 60, `${meta}: teaches item "${t}" should be a short phrase (up to 60 characters)`).toBe(true);
    expect(entry.skills.length >= 1 && entry.skills.length <= 4, `${meta}: skills needs one to four of ${SONG_SKILLS.join(', ')}`).toBe(true);
    for (const s of entry.skills) expect(SONG_SKILLS as readonly string[], `${meta}: skill "${s}" is not one of ${SONG_SKILLS.join(', ')}`).toContain(s);
    expect(new Set(entry.skills).size, `${meta}: a skill is listed twice`).toBe(entry.skills.length);
    for (const tag of entry.tags) expect(tag, `${meta}: tags are lower case ("${tag}")`).toBe(tag.toLowerCase());
    const sentences = entry.about.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 3);
    expect(sentences.length >= 2 && entry.about.length <= 700, `${meta}: about needs two to four sentences: how it should sound, the common mistake, the fix`).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(entry.added) && !Number.isNaN(Date.parse(entry.added)), `${meta}: added must be a date like 2026-11-15`).toBe(true);
    expect(entry.about.includes('!'), `${meta}: no exclamation marks in learner copy`).toBe(false);
  });

  it('the skills it claims are in the music', async () => {
    const song = await parsed(id);
    const beats = song.tracks.flatMap((t) => t.measures.flatMap((m) => m.beats));
    const has = {
      lyrics: beats.some((b) => !!b.lyric),
      slashes: beats.some((b) => b.slash),
      chords: song.chords.length > 0,
      notes: beats.some((b) => b.notes.length > 0),
    };
    if (entry.skills.includes('singing')) expect(has.lyrics, `${meta}: "singing" needs lyrics in ${file}`).toBe(true);
    if (entry.skills.includes('strumming')) expect(has.slashes, `${meta}: "strumming" needs strummed slashes (D U /) in ${file}`).toBe(true);
    if (entry.skills.includes('chords')) expect(has.chords, `${meta}: "chords" needs chord symbols ("G") in ${file}`).toBe(true);
    if (entry.skills.includes('melody')) expect(has.notes, `${meta}: "melody" needs notes in ${file}`).toBe(true);
    const seconds = flattenSong(song).totalSeconds;
    expect(seconds > 5 && seconds < 15 * 60, `${file}: plays for ${Math.round(seconds)} s; a song lasts between 5 seconds and 15 minutes`).toBe(true);
  });

  it('matches the repertoire plan entry it names', () => {
    if (!entry.plan) return;
    const item = PLAN.get(entry.plan);
    expect(item, `${meta}: plan "${entry.plan}" is not an id in src/content/plan/repertoire.json`).toBeDefined();
    expect(entry.plan, `${meta}: a song from the plan uses the plan's id as its folder name ("${entry.plan}/")`).toBe(id);
    expect(entry.level, `${meta}: the plan puts "${entry.plan}" at level ${item!.level}`).toBe(item!.level);
    if (item!.key) expect(keyName(entry.key), `${meta}: the plan writes "${entry.plan}" in ${item!.key}`).toBe(keyName(item!.key));
  });
});

describe('reading studies', () => {
  const readers = SONG_ENTRIES.filter((e) => e.prefersNotation);

  it('open with the notation: every reading study of the plan, and nothing that is not one', () => {
    const studies = SONG_ENTRIES.filter((e) => /^st-read-/.test(e.id)).map((e) => e.id).sort();
    expect(studies).toEqual(['st-read-fifth-position', 'st-read-first-c', 'st-read-first-g', 'st-read-first-sharps', 'st-read-second-position', 'st-read-seventh-position', 'st-read-shifting']);
    expect(readers.map((e) => e.id).sort()).toEqual(studies);
  });

  it.each(readers.map((e) => [e.id, e] as [string, SongEntry]))('%s has notes to read and says it is about reading', async (id, entry) => {
    const song = await parsed(id);
    expect(song.tracks[0].measures.some((m) => m.beats.some((b) => b.notes.length > 0)), `${id}: the first part has no notes to read`).toBe(true);
    expect(entry.tags, `${id}/meta.ts: tag it "reading"`).toContain('reading');
  });
});

describe('the registry', () => {
  it('lists songs easiest first', () => {
    const levels = SONG_ENTRIES.map((e) => e.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('finds an entry by id and rejects an unknown one', async () => {
    expect(songEntry('hot-cross-buns')?.title).toBe('Hot Cross Buns');
    expect(songEntry('no-such-song')).toBeUndefined();
    await expect(loadSongText('no-such-song')).rejects.toThrow(/no built-in song/);
  });
});
