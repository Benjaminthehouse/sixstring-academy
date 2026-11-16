# `@/core/platform` — the host: storage, media, AI, files, saving, speech, sync, wake lock

Everything that touches the host (browser APIs, the Claude-artifact runtime, the one permitted network
call) lives here. Features import from `@/core/platform` and never call `localStorage`, `getUserMedia`,
`fetch`, `<a download>`, `window.print`, the clipboard or `speechSynthesis` themselves. No service throws
because something is missing: each returns a typed "not available" result with a sentence you can show.
`createAi / createCloudSync / createSpeech / createWakeLock(deps)` build instances on fakes for tests.

## Publishing as a Claude artifact: capabilities to declare

| Service | Declare at publish time | Without it |
|---|---|---|
| `ask`, `askJson` | `sample: { images: true }` (`sample: {}` allows text only) | `aiStatus().available === false` |
| `saveFile` | `downloads: true` | `{ ok: false, reason: 'unavailable' }` |
| cloud sync | `db: {}` **and** `user: {}` (no rules: `data/users/<id>/` is private by default) | status `off` |
| `speak` | `tts: {}` | the browser's own voice if the frame has one, else unavailable |

All of it: `capabilities: { sample: { images: true }, downloads: true, db: {}, user: {}, tts: {} }`.
The standalone app needs none of this. Microphone, camera and print stay refused in the viewer whatever is declared.

## Already here: `env`, `storage`, `media`

`host() isArtifact() claudeCapability(name)` · `readJSON writeJSON readRaw writeRaw remove keys isPersistent` ·
`requestMic requestCamera stopStream listDevices explainMediaFailure`.

## What a stored key is (`storage-scope.ts`, `storage-merge.ts`; import those files directly)

**The rule: every key kept through platform storage is the learner's data unless `DATA_RULES` says
otherwise.** Learner data travels in backups (Me > Your data > Export / Import) and cloud sync, and a
reset erases it. A feature that stores something with `useLocalState` / `writeJSON` is covered without
anyone listing it. `classifyKey(key)` gives the class; the exceptions, each with its reason:

| class | keys | backup / sync | reset |
|---|---|---|---|
| `learner` (default) | everything not below | yes / yes | erased |
| `learner`, `sync: false` | `rhythm.calibration` (this device's own audio delay) | yes / no | erased |
| `session` | `practice.session`, `lesson-session.*`, `player.session.*`, `teachers.task`, `shell.onboarding` | no / no | erased |
| `device` | `sync.*`, `data.*`, `shell.nav-open`, `learn.conditions`, `player.micNotice`, `camera.blockedOnce`, `camera.capoAskedAt`, `kit.*`, `arcade.test-seed`, `__probe` | no / no | kept |
| `secret` | `ai.*` (the API key) | never / never | kept |
| `progress` | `progress`, `progress.*` | via the progress export | via `resetProgress` |
| `songs` | `library.*` (the songs' key-value fallback) | song by song (`@/core/library`) | only with "also delete my songs" |
| device-only blobs, not in key-value storage | the Recorder's takes: IndexedDB `ssa-recorder` (`takes.json` + `take/<id>`, `features/recorder/model/store.ts`), to move to the platform blob store under the same keys | no / no (too large: about 0.5 MB a minute; the screen says so and offers "Save as a file") | kept (deleted take by take on the Recorder screen) |

So: a new key needs a line in `DATA_RULES` only when it is **not** the learner's (it describes this
device or screen, is work in progress, or is secret). Something the learner made or earned (rather than
a setting) also gets a `DATA_ITEMS` line (label, unit, `shape: 'list' | 'object'`, optional `field` for a
list inside an object, `max` when the feature keeps no more than that, `whole` for a draft, and count):
Your data then counts it, "Reset, keep my name and settings" erases it, and merges join its lists; an
unlisted key counts as a setting and is merged whole (newest change wins), never stitched together.

`isDamagedRecord(key, entry)`: a record of the wrong shape (a journal that is not a list, arcade records
that are not an object, a list none of whose items is an object, text that is not JSON). A damaged copy
never takes the place of a good one in a merge, and `sanitizeDataSet(input, { records: true })` (what a
backup file is read with) leaves it out and names it in `damaged` as well as `skipped`. Cloud sync reads its
own copies without `records`.

```ts
classifyKey('practice.data')      // 'learner'      classifyKey('ai.anthropic-key') // 'secret'
syncsKey('rhythm.calibration')    // false           isRecordKey('arcade')           // true
const data = getLearnerData();    // on platform storage; createLearnerData(memoryKv()) in tests
data.snapshot()                   // { key: { at, value } | { at, raw } } of learner keys, change times included
data.write(key, entry) / data.remove(key) / data.subscribe(fn) / data.digest(syncsKey) / data.sums()
announceStorageChange(keys)       // a `storage` event per key, for features that follow other tabs
```

**Change times.** Features write through `storage.ts`, which says nothing, so a ledger (`data.ledger`)
keeps a checksum per learner key and when a change was first noticed (`at`; 0 = before tracking began).
`startDataTracker()` notices at startup, every 30 s, on hide and on another tab's write;
`startCloudSync()` starts it in every host. **A feature that keeps a key in memory should re-read it on
the window `storage` event** (as `practice/model/store.ts` does): imports, resets and sync announce
their writes that way. Imports and resets also reload the page, so nothing stale survives them.

**Merging** (`storage-merge.ts`, pure): `mergeEntry(key, local, incoming)` merges a **record**
(`isRecordKey`): it joins lists of objects by `id` (the copy changed last wins an id; lists without ids join
by content; an item that is not an object is dropped), joins the lists inside an object such as
`practice.data` and takes its other fields from the newer side, keeps the best of both arcade records,
keeps each rhythm calibration measurement from the side that measured last, and never lets a damaged copy
replace a good one. A **setting** (any other learner key, whatever it holds: a remembered view, today's
practice plan) and a **draft** (`whole`: the progression in the builder) are taken whole from the side
that changed last. `planDataImport(local, file, 'merge' | 'replace', scope?, keep?)` (`keep`: keys whose
file entry was damaged, left as they are here even by `replace`) and `planDataSync(local, cloud, base,
strategy)` (three-way: a key only one side changed comes from that side, deletions included) return
`{ result, write, remove }`.

## AI (`ai.ts`): one `ask` for both hosts

```ts
aiStatus(): Promise<{ available, enabled, provider: 'artifact' | 'anthropic' | 'none', images, maxImages, reason? }>
ask({ system?, prompt, history?, images?, json?, tier?, onText?, signal?, maxTokens?, fresh? })
  : Promise<{ text, truncated, provider, tier, json? }>            // rejects with AiError
askJson<T>({ ...same, validate: (value: unknown) => T, retry? }): Promise<{ value: T, text, attempts, provider, tier }>
setApiKey(key): { ok: true } | { ok: false, message }   clearApiKey()   hasApiKey()   apiKeyHint()   verifyApiKey(key?)
encodeImage(blobOrCanvas, { maxBytes?, maxEdge?, type?, quality? }): Promise<{ blob, width, height, type }>
```

- **The learner's opt-in is enforced here.** While Settings > AI helper is off (`prefs.ai.enabled`
  false, the default), `ask` / `askJson` reject with `AiError('disabled')` before anything is sent or any
  host permission is asked, so no caller can forget it. `aiStatus()` reports the switch as `enabled`,
  next to what the host offers (`available`, `provider`, `images`, `reason`): `ask` works only when
  `available && enabled`, and a screen can say which one is missing ("add a key" against "turn it on in
  Settings"). Screens still check `aiAllowed()` from `@/core/settings` before offering an AI button and
  link to `#profile--settings--ai` instead. `verifyApiKey` (Settings checking a key the learner just
  pasted) is not gated. Tests pass `createAi({ enabled: () => true, ... })`.
- **Providers.** In an artifact: the viewer's `sample` capability (spends the viewer's Claude usage and asks
  consent on the first call, so call only from a click; after a decline `ask` rejects `not-granted` and is
  never re-asked). Standalone: the Anthropic Messages API from the browser with the learner's own key
  (`setApiKey`, stored on this device only, sent only to `api.anthropic.com`, never logged). No key = no request.
- **`tier`**: `quick` (fast, short answers) · `default` · `complex` (hardest reasoning: reading a score).
  Standalone models: `claude-haiku-5-5` / `claude-opus-5-5` / `claude-opus-5-5` at high effort (`ANTHROPIC_MODELS`).
- **`images`**: `Blob | File | canvas`, at most `maxImages`; check `aiStatus().images` first. Photos are turned
  upright, stripped of EXIF and shrunk for you. **`history`**: earlier `{ role, content }` turns (nothing is remembered).
- **`onText(text, delta)`**: `text` is the whole answer so far. Show "Thinking…" until it first fires (5-60 s on
  `default`/`complex`). **`fresh: true`** skips the viewer's 5-minute answer cache (chat turns, "Try again").
- **`askJson`**: say the exact JSON shape in the prompt; `validate` throws an `Error` describing what is wrong and
  that message is sent back for **one** retry. Then `AiError('bad-response')` with `detail` and raw `partial`.
- **`AiError`**: `kind` = `disabled · not-available · not-granted · rate-limited · network · bad-key · refused · aborted ·
  too-large · bad-image · bad-response · server · billing · invalid`; `message` is written for the learner;
  `retryable`; `partial` = text that may stay on screen (never after `refused`). Overloads and dropped
  connections are retried twice before any text was shown, never after.

```ts
// Ask the teacher, streaming, with a Stop button
const ctl = new AbortController();
try {
  const { text } = await ask({ system: teacherPersona('mia'), history, prompt: question, fresh: true,
    signal: ctl.signal, onText: (soFar) => setAnswer(soFar) });
  history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
} catch (e) { if (isAiError(e) && e.kind !== 'aborted') showError(e.message); }

// Sheet scanner: photo in, validated JSON out
const { value } = await askJson({ tier: 'complex', images: [photoFile],
  prompt: 'Transcribe this guitar tab. Reply as {"bars": [{"notes": [{"string": 1-6, "fret": number, "ticks": number}]}]}',
  validate: parseScannedTab });   // throws Error('bars[2].notes[0].fret is missing') -> one retry
```

## Files (`files.ts`)

```ts
pickFile({ accept?, multiple?, capture? }): Promise<File[]>   pickOneFile(opts): Promise<File | null>
readFileText(blob)  readFileBytes(blob)  readFileArrayBuffer(blob)  readFileDataUrl(blob)  decodeText(bytes)
loadImage(blob): Promise<{ source, width, height, release() }>      // upright: EXIF orientation applied
sniffFile(file) / sniffBytes(bytes, name?): { kind, family, mime, detail? }
onPasteImage((images) => …, target?)  attachDropZone(el, { accept?, multiple?, onFiles(files, rejected), onHover? })
matchesAccept(file, accept)  filesFromDataTransfer(dt, accept?)  jpegInfo(bytes)  exifOrientation(bytes)
```

- `pickFile` must be called **directly in a click/key handler**; `[]` = dismissed. `capture: true` opens the rear camera.
- `kind`: `pdf png jpeg gif webp heic midi musicxml mxl gp zip xml text unknown`; `family`: `image document
  score archive text unknown`; Guitar Pro `detail`: `gp3 gp4 gp5 gpx gp7`. Judged by content, not by name.
- `onPasteImage` / `attachDropZone` return their cleanup function: call it in the effect cleanup.

```ts
const file = await pickOneFile({ accept: ['image/*', '.pdf', '.gp', '.gpx', '.mid', '.musicxml', '.mxl', '.txt'] });
if (!file) return;
const { family, kind } = await sniffFile(file);
if (family === 'image') { const img = await loadImage(file); ctx.drawImage(img.source, 0, 0); img.release(); }
else if (kind === 'text') importTab(await readFileText(file));
```

## Saving, copying, sharing, printing (`download.ts`)

```ts
saveFile(filename, data: string | Blob | ArrayBuffer | ArrayBufferView, mimeType?)
  : Promise<{ ok: true, via: 'viewer' | 'browser' } | { ok: false, reason, message }>   // never throws
canSaveFile(filename): Promise<boolean>   copyText(text): Promise<boolean>   canPrint()   printPage()
shareOrCopy({ title?, text?, url?, files? }): Promise<{ ok: true, via: 'share' | 'copy' } | { ok: false, reason }>
```

`reason`: `declined · unsupported-type · too-large · busy · unavailable · failed`. In the viewer the learner
confirms every save (expect `declined`; show nothing for it) and only `VIEWER_SAVE_EXTENSIONS` can be saved
(`json txt md csv pdf png jpg svg zip html …`; **not** `.mid .musicxml .gp .wav`): hide those exports with `canSaveFile`.

```ts
const result = await saveFile('sixstring-progress.json', JSON.stringify(exportProgress()), 'application/json');
if (!result.ok && result.reason !== 'declined') toast(result.message);
```

## Speech (`speech.ts`)

```ts
speak(text, { voice?: 'mia' | 'dev' | 'elena' | 'narrator', rate?, lang?, queue? }): Promise<{ ok: true } | { ok: false, reason }>
stopSpeaking()   speechAvailable(): Promise<boolean>   isSpeaking()   getSpeechState()   subscribeSpeech(listener)
```

Viewer `tts` voice in an artifact, otherwise an on-device browser voice chosen per teacher. Start it from a click.
`C#` / `B♭` are read "C sharp" / "B flat" and Markdown marks are dropped (`speakableText`). A new `speak` replaces the
current one unless `queue`. Always keep the text on screen; hide speaker buttons when `speechAvailable()` is false.
`const s = useSyncExternalStore(subscribeSpeech, getSpeechState)` gives `{ speaking, available, provider, voice }`.

## Cloud sync (`sync.ts`), artifact host only

```ts
startCloudSync(): Promise<SyncStatus>   syncNow()   stopCloudSync()   getSyncStatus()   subscribeSyncStatus(listener)
// SyncStatus = { state: 'off' | 'syncing' | 'synced' | 'error', issue, message, lastSyncedAt, pending, songs }
```

**Shell: call `startCloudSync()` once at startup** (in standalone it only starts the data tracker; never throws,
never reloads the page). It keeps one copy in `data/users/<viewer id>/progress` (plus `progress.<gen>.<n>` parts
when it exceeds one 256 KiB document): the progress export, merged with `importProgress(..., 'newest-wins')` and
then guarded so total XP is not below either side and two halves of one unbroken streak are joined; and `data`,
every learner key `syncsKey` accepts, merged per key with `planDataSync` (newest change wins for a setting or a
draft, a record's lists joined, arcade bests kept; a key changed on one side only travels as it is, deletions too).
Lists have no tombstones: an item deleted on one device while the other device changed the same key comes back. An unused install takes
the cloud copy over as it is; a reset (or a "replace" restore) wins everywhere, for the data too.

**Songs** ride along when they fit `SONG_SYNC_LIMITS` (50 songs, each under 180 KB, 2 MB together; the database
holds 25,000 documents for every viewer of the artifact): one document per song (`song.<id>`, written only when
that song changed) and the list in the copy, merged song by song the same three-way. Otherwise they stay on each
device and `status.songs` says why: `{ synced, count, bytes, reason: 'count' | 'size' | 'total' | 'elsewhere' | null }`.

Writes: debounced 5 s, at least 20 s apart, one at a time, only on change, never before the first confirmed read,
exponential backoff. `issue`: `standalone not-offered unreachable retrying read-only storage-full update-needed revoked`.
A copy written by an older app (no `data`, no song list) leaves this device's data and songs alone. Tests:
`createCloudSync({ progress: () => appDataPort(store, createLearnerData(memoryKv()), songSyncPort(lib)) })`.

```tsx
const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);   // profile screen
<StatusRow tone={sync.state} text={sync.message} action={sync.pending ? { label: 'Sync now', run: syncNow } : undefined} />
```

## Wake lock (`wake-lock.ts`)

`keepAwake(): () => void` (counted; `useEffect(() => keepAwake(), [])` while practising) · `requestWakeLock():
Promise<boolean>` · `releaseWakeLock()` · `isWakeLockSupported()` · `getWakeLockState()` → `{ supported, wanted,
active }` · `subscribeWakeLock(listener)`. Re-acquired when the tab becomes visible; a refusal is never an error.
