import { describe, expect, it } from 'vitest';
import { CAMPFIRE_GROOVE, ODE_TO_JOY, sixTab, songToJson } from '@/core/song';
import { exportMySongs, importSongBackups, removeMySongs, songContentSum, songFromBackup, songSyncPort, type SongBackup } from './backup';
import { createLibrary, type Library } from './library';
import { memoryStore } from './store';

function makeLibrary(now = () => 1_700_000_000_000): Library {
  let seed = 7;
  return createLibrary({ store: memoryStore(), now, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), broadcast: false });
}

describe('exportMySongs / importSongBackups: the learner’s songs travel exactly', () => {
  it('round-trips into an empty library with the same ids, details and notes', async () => {
    const a = makeLibrary();
    const ode = await a.save(sixTab(ODE_TO_JOY));
    await a.update(ode.id, { notes: 'Slow on bar 3', tags: ['Warm-up'], level: 2 });
    await a.save(sixTab(CAMPFIRE_GROOVE));
    await a.duplicate('hot-cross-buns');
    const backup = JSON.parse(JSON.stringify(await exportMySongs(a))) as SongBackup[];
    expect(backup).toHaveLength(3);
    expect(backup.every((s) => s.listing.id.startsWith('my-') && !('summary' in s.listing))).toBe(true);

    const b = makeLibrary();
    const r = await importSongBackups(backup, 'merge', b);
    expect(r.added.sort()).toEqual(backup.map((s) => s.listing.id).sort());
    expect(r.skipped).toBe(0);
    const back = await b.get(ode.id);
    expect(back).toMatchObject({ title: 'Ode to Joy', notes: 'Slow on bar 3', tags: ['warm-up'], level: 2, levelSource: 'set', source: 'mine' });
    expect(back?.summary?.bars).toBeGreaterThan(0);
    expect(songToJson(await b.load(ode.id), { pretty: false })).toBe(songToJson(await a.load(ode.id), { pretty: false }));
    // Built-in songs never travel; they are already in every copy of the app.
    expect((await b.list({ scope: 'mine' })).length).toBe(3);
  });

  it('never deletes a song; merge keeps the newer copy, replace takes the file’s, the same song is left alone', async () => {
    let t = 1_700_000_000_000;
    const lib = makeLibrary(() => t);
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    const old = (await exportMySongs(lib))[0];
    t += 60_000;
    await lib.update(saved.id, { notes: 'Changed later here' });
    const other = await lib.save(sixTab(CAMPFIRE_GROOVE));

    const merged = await importSongBackups([old], 'merge', lib);
    expect(merged).toMatchObject({ added: [], kept: [saved.id], replaced: [] });
    expect((await lib.get(saved.id))?.notes).toBe('Changed later here');

    const replaced = await importSongBackups([old], 'replace', lib);
    expect(replaced.replaced.map((s) => s.listing.notes)).toEqual(['Changed later here']);
    expect((await lib.get(saved.id))?.notes).toBeUndefined();
    expect(await lib.get(other.id)).not.toBeNull();

    const again = await importSongBackups([old], 'replace', lib);
    expect(again.kept).toEqual([saved.id]);
  });

  it('skips entries that are not readable songs, and imports the rest', async () => {
    const a = makeLibrary();
    await a.save(sixTab(ODE_TO_JOY));
    const [good] = await exportMySongs(a);
    const junk: unknown[] = [
      null,
      { listing: { id: 'greensleeves' }, json: good.json },
      { listing: { id: 'my-bad' }, json: '{"format":"sixstring-song","version":1,"song":{"meta":{}}}' },
      { listing: { ...good.listing, id: 'my-not json' }, json: good.json },
      good,
      good,
    ];
    const b = makeLibrary();
    const r = await importSongBackups(junk, 'merge', b);
    expect(r.added).toEqual([good.listing.id]);
    expect(r.skipped).toBe(5);
  });

  it('checks a backed-up listing field by field', () => {
    const item = { listing: { id: 'my-x-1234', title: 42, level: 99, style: 'not-a-style', tags: ['a', 3], addedAt: -5 }, json: songToJson(sixTab(ODE_TO_JOY), { pretty: false }) };
    const song = songFromBackup(item, 5000);
    expect(song?.listing).toMatchObject({ id: 'my-x-1234', title: 'Untitled song', levelSource: 'estimated', tags: ['a'], addedAt: 5000, source: 'mine' });
    expect(song?.listing.style).toBeUndefined();
  });

  it('removeMySongs deletes only the learner’s songs and hands them back for undo', async () => {
    const lib = makeLibrary();
    await lib.save(sixTab(ODE_TO_JOY));
    const removed = await removeMySongs(lib);
    expect(removed).toHaveLength(1);
    expect(await lib.list({ scope: 'mine' })).toEqual([]);
    expect((await lib.list()).length).toBeGreaterThan(0);
    await lib.restore(removed[0]);
    expect((await lib.list({ scope: 'mine' })).length).toBe(1);
  });
});

describe('songSyncPort', () => {
  it('fingerprints content, not save times, so a restored copy reads as the same song', async () => {
    let t = 1_700_000_000_000;
    const a = makeLibrary(() => t);
    const b = makeLibrary(() => t);
    await a.save(sixTab(ODE_TO_JOY));
    const pa = songSyncPort(a);
    const pb = songSyncPort(b);
    await pa.ready();
    await pb.ready();
    const indexA = await pa.index();
    const [id] = Object.keys(indexA);
    t += 5000;
    expect(await pb.write(await pa.read(id))).toBe(true);
    const indexB = await pb.index();
    expect(indexB[id].sum).toBe(indexA[id].sum);
    expect(indexB[id].u).not.toBe(indexA[id].u);
    expect(pb.stamp()).toContain(id);
    expect(await pb.write({ listing: { id: 'my-junk' }, json: 'nope' })).toBe(false);
    await pb.remove(id);
    expect(await pb.index()).toEqual({});
  });

  it('a change to the learner’s details changes the fingerprint', async () => {
    const lib = makeLibrary();
    const saved = await lib.save(sixTab(ODE_TO_JOY));
    const json = songToJson(await lib.load(saved.id), { pretty: false });
    const before = songContentSum({ listing: saved, json });
    const after = songContentSum({ listing: await lib.update(saved.id, { notes: 'x' }), json });
    expect(after).not.toBe(before);
  });
});
