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
The standalone app needs none of this. Microphone, camera, print and the wake lock stay refused in the viewer.

## Already here: `env`, `storage`, `media`

`host() isArtifact() claudeCapability(name)` · `readJSON writeJSON readRaw writeRaw remove keys isPersistent` ·
`requestMic requestCamera stopStream listDevices explainMediaFailure`.

## AI (`ai.ts`): one `ask` for both hosts

```ts
aiStatus(): Promise<{ available, provider: 'artifact' | 'anthropic' | 'none', images, maxImages, reason? }>
ask({ system?, prompt, history?, images?, json?, tier?, onText?, signal?, maxTokens?, fresh? })
  : Promise<{ text, truncated, provider, tier, json? }>            // rejects with AiError
askJson<T>({ ...same, validate: (value: unknown) => T, retry? }): Promise<{ value: T, text, attempts, provider, tier }>
setApiKey(key): { ok: true } | { ok: false, message }   clearApiKey()   hasApiKey()   apiKeyHint()   verifyApiKey(key?)
encodeImage(blobOrCanvas, { maxBytes?, maxEdge?, type?, quality? }): Promise<{ blob, width, height, type }>
```

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
- **`AiError`**: `kind` = `not-available · not-granted · rate-limited · network · bad-key · refused · aborted ·
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
// SyncStatus = { state: 'off' | 'syncing' | 'synced' | 'error', issue, message, lastSyncedAt, pending }
```

**Shell: call `startCloudSync()` once at startup** (no-op in standalone; never throws, never reloads the page).
It keeps the progress export in `data/users/<viewer id>/progress` (plus `progress.<gen>.<n>` parts when the
export exceeds one 256 KiB document), merges the cloud copy with `importProgress(..., 'newest-wins')` and then
guarantees that total XP is not below either side and that two halves of one unbroken streak are joined. An unused
install takes the cloud copy over as it is; a reset (or a "replace" restore) wins everywhere. Writes: debounced 5 s,
at least 20 s apart, one at a time, only on change, never before the first confirmed read, exponential backoff.
`issue`: `standalone not-offered unreachable retrying read-only storage-full update-needed revoked`.

```tsx
const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);   // profile screen
<StatusRow tone={sync.state} text={sync.message} action={sync.pending ? { label: 'Sync now', run: syncNow } : undefined} />
```

## Wake lock (`wake-lock.ts`)

`keepAwake(): () => void` (counted; `useEffect(() => keepAwake(), [])` while practising) · `requestWakeLock():
Promise<boolean>` · `releaseWakeLock()` · `isWakeLockSupported()` · `getWakeLockState()` → `{ supported, wanted,
active }` · `subscribeWakeLock(listener)`. Re-acquired when the tab becomes visible; a refusal is never an error.
