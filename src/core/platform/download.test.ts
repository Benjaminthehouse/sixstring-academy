// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canPrint,
  canSaveFile,
  copyText,
  mapDownloadsError,
  printPage,
  safeFilename,
  saveFile,
  shareOrCopy,
  VIEWER_SAVE_EXTENSIONS,
  type DownloadDeps,
  type SaveFailure,
} from './download';

type SaveRequest = { filename: string; data: unknown };

function viewer(save: (request: SaveRequest) => Promise<{ status: string }>): { deps: DownloadDeps; requests: SaveRequest[] } {
  const requests: SaveRequest[] = [];
  const capability = {
    save: (request: SaveRequest) => {
      requests.push(request);
      return save(request);
    },
  };
  return {
    requests,
    deps: { host: () => 'artifact', framed: () => true, capability: async <T>(name: string) => (name === 'downloads' ? (capability as T) : null) },
  };
}

const standalone: DownloadDeps = { host: () => 'standalone', framed: () => false, capability: async () => null };

function setNavigator(name: string, value: unknown): void {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
  for (const name of ['clipboard', 'share', 'canShare']) Reflect.deleteProperty(navigator, name);
  Reflect.deleteProperty(document, 'execCommand');
});

describe('safeFilename', () => {
  it('removes what file systems refuse and keeps the extension when shortening', () => {
    expect(safeFilename('Greensleeves: tab/notation?.pdf')).toBe('Greensleeves tab notation.pdf');
    expect(safeFilename('  ..hidden..  ')).toBe('hidden');
    expect(safeFilename('\u0000\u0001')).toBe('sixstring-academy');
    const long = safeFilename(`${'a'.repeat(300)}.json`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('.json')).toBe(true);
  });
});

describe('saveFile inside the artifact viewer', () => {
  it('offers the file through the downloads capability', async () => {
    const { deps, requests } = viewer(async () => ({ status: 'saved' }));
    const result = await saveFile('my progress.json', '{"xp":120}', 'application/json', deps);
    expect(result).toEqual({ ok: true, via: 'viewer' });
    expect(requests).toEqual([{ filename: 'my progress.json', data: '{"xp":120}' }]); // text goes as a string
  });

  it('hands binary data over as a Blob, so the caller keeps its buffer', async () => {
    const { deps, requests } = viewer(async () => ({ status: 'saved' }));
    const bytes = new Uint8Array([137, 80, 78, 71]);
    expect(await saveFile('fretboard.png', bytes.buffer, 'image/png', deps)).toEqual({ ok: true, via: 'viewer' });
    const sent = requests[0].data as Blob;
    expect(sent).toBeInstanceOf(Blob);
    expect(sent.type).toBe('image/png');
    expect(sent.size).toBe(4);
    expect(bytes.buffer.byteLength).toBe(4); // not detached

    await saveFile('chart.png', new Uint8Array([1, 2, 3]), 'image/png', deps);
    expect(requests[1].data).toBeInstanceOf(Blob);
  });

  it('refuses file types the viewer does not allow without bothering the learner', async () => {
    const { deps, requests } = viewer(async () => ({ status: 'saved' }));
    for (const name of ['song.mid', 'song.musicxml', 'riff.gp', 'take.wav', 'no-extension']) {
      const result = await saveFile(name, 'data', '', deps);
      expect(result).toMatchObject({ ok: false, reason: 'unsupported-type' });
      if (!result.ok) expect(result.message).toMatch(/own address/);
    }
    expect(requests).toHaveLength(0);
    expect(VIEWER_SAVE_EXTENSIONS).toEqual(expect.arrayContaining(['json', 'txt', 'pdf', 'png', 'svg', 'zip', 'csv', 'md']));
    expect(VIEWER_SAVE_EXTENSIONS).not.toContain('mid');
  });

  it('reports a decline and the other outcomes without throwing', async () => {
    const table: Array<[string, SaveFailure]> = [
      ['declined', 'declined'],
      ['rejected_extension', 'unsupported-type'],
      ['extension_not_enabled', 'unsupported-type'],
      ['too_large', 'too-large'],
      ['rate_limited', 'busy'],
      ['bad_request', 'failed'],
      ['transform_error', 'failed'],
      ['unavailable', 'unavailable'],
      ['not_granted', 'unavailable'],
      ['capability_disabled', 'unavailable'],
      ['something_new', 'unavailable'],
    ];
    for (const [code, reason] of table) {
      expect(mapDownloadsError({ code, message: 'x' })).toBe(reason);
      const { deps } = viewer(async () => Promise.reject({ code, message: 'developer text' }));
      const result = await saveFile('tab.txt', 'e|--0--|', 'text/plain', deps);
      expect(result).toMatchObject({ ok: false, reason });
      if (!result.ok) expect(result.message).not.toContain('developer text');
    }
    expect(mapDownloadsError(new Error('boom'))).toBe('unavailable');
  });

  it('is unavailable when framed by the viewer without the capability (a plain download would vanish)', async () => {
    const deps: DownloadDeps = { host: () => 'artifact', framed: () => true, capability: async () => null };
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    expect(await saveFile('tab.txt', 'e|--0--|', 'text/plain', deps)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(await canSaveFile('tab.txt', deps)).toBe(false);
  });

  it('has nothing to save for empty data', async () => {
    const { deps, requests } = viewer(async () => ({ status: 'saved' }));
    expect(await saveFile('empty.txt', '', 'text/plain', deps)).toMatchObject({ ok: false, reason: 'failed' });
    expect(await saveFile('empty.bin', new Uint8Array(0), '', standalone)).toMatchObject({ ok: false, reason: 'failed' });
    expect(requests).toHaveLength(0);
  });
});

describe('saveFile in the standalone app', () => {
  it('clicks a temporary object-URL link and lets go of the URL later', async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:sixstring/1';
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clicked: Array<{ href: string; download: string; attached: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
    });

    const result = await saveFile('Greensleeves.mid', new Uint8Array([0x4d, 0x54, 0x68, 0x64]), 'audio/midi', standalone);
    expect(result).toEqual({ ok: true, via: 'browser' });
    expect(clicked).toEqual([{ href: 'blob:sixstring/1', download: 'Greensleeves.mid', attached: true }]);
    expect(blobs[0].type).toBe('audio/midi');
    expect(blobs[0].size).toBe(4);
    expect(document.querySelector('a')).toBeNull(); // the link is gone again
    expect(revokeObjectURL).not.toHaveBeenCalled(); // the download still needs the URL
    vi.advanceTimersByTime(61_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sixstring/1');

    await saveFile('notes.txt', 'plain words', '', standalone);
    expect(blobs[1].type).toBe('text/plain;charset=utf-8');
    expect(await canSaveFile('song.mid', standalone)).toBe(true);
  });

  it('also downloads directly when the artifact page is opened on its own (not framed)', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const deps: DownloadDeps = { host: () => 'artifact', framed: () => false, capability: async () => null };
    expect(await saveFile('tab.txt', 'e|--0--|', 'text/plain', deps)).toEqual({ ok: true, via: 'browser' });
  });
});

describe('copyText', () => {
  it('uses the clipboard API when it works', async () => {
    const writeText = vi.fn(async () => undefined);
    setNavigator('clipboard', { writeText });
    expect(await copyText('E A D G B E')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('E A D G B E');
  });

  it('falls back to a hidden selection when the clipboard API is refused, and tidies up', async () => {
    setNavigator('clipboard', { writeText: vi.fn(async () => Promise.reject(new DOMException('denied', 'NotAllowedError'))) });
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    let selected = '';
    const execCommand = vi.fn((command: string) => {
      selected = (document.activeElement as HTMLTextAreaElement).value;
      return command === 'copy';
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    expect(await copyText('x|--2--|')).toBe(true);
    expect(selected).toBe('x|--2--|');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button); // focus goes back where it was
  });

  it('answers false when nothing works', async () => {
    expect(await copyText('nothing')).toBe(false);
  });
});

describe('shareOrCopy', () => {
  it('opens the share sheet when the browser has one', async () => {
    const share = vi.fn(async () => undefined);
    setNavigator('share', share);
    setNavigator('canShare', () => true);
    expect(await shareOrCopy({ title: 'My streak', text: '30 days of practice', url: 'https://example.test/app' })).toEqual({ ok: true, via: 'share' });
    expect(share).toHaveBeenCalledWith({ title: 'My streak', text: '30 days of practice', url: 'https://example.test/app' });
  });

  it('shares files only when the browser says it can', async () => {
    const share = vi.fn(async () => undefined);
    setNavigator('share', share);
    setNavigator('canShare', (data: ShareData) => !data.files);
    const file = new File(['x'], 'tab.txt', { type: 'text/plain' });
    await shareOrCopy({ text: 'My tab', files: [file] });
    expect(share).toHaveBeenCalledWith({ text: 'My tab' });
  });

  it('reports a dismissed share sheet as cancelled and copies nothing', async () => {
    setNavigator('share', vi.fn(async () => Promise.reject(new DOMException('dismissed', 'AbortError'))));
    const writeText = vi.fn(async () => undefined);
    setNavigator('clipboard', { writeText });
    expect(await shareOrCopy({ text: 'hello' })).toEqual({ ok: false, reason: 'cancelled' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies instead when sharing is missing or refused', async () => {
    const writeText = vi.fn(async () => undefined);
    setNavigator('clipboard', { writeText });
    expect(await shareOrCopy({ title: 'ignored', text: 'Try this lick', url: 'https://example.test/l/1' })).toEqual({ ok: true, via: 'copy' });
    expect(writeText).toHaveBeenLastCalledWith('Try this lick\nhttps://example.test/l/1');

    setNavigator('share', vi.fn(async () => Promise.reject(new DOMException('blocked in this frame', 'NotAllowedError'))));
    expect(await shareOrCopy({ text: 'Try this lick' })).toEqual({ ok: true, via: 'copy' });
  });

  it('says so when there is no way to share or copy', async () => {
    expect(await shareOrCopy({ text: 'hello' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await shareOrCopy({})).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('printing', () => {
  it('prints in the standalone app and never inside the viewer frame', () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    expect(canPrint(standalone)).toBe(true);
    expect(printPage(standalone)).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);

    const framed = { host: () => 'artifact' as const, framed: () => true };
    expect(canPrint(framed)).toBe(false);
    expect(printPage(framed)).toBe(false);
    expect(print).toHaveBeenCalledTimes(1);
  });
});
