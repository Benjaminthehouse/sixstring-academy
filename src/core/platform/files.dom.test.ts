// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDropZone, filesFromDataTransfer, onPasteImage, pickFile, pickOneFile } from './files';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const pickerInput = (): HTMLInputElement | null => document.querySelector('input[type="file"]');

/** jsdom has no way to choose files, so stand in for the browser: set `files` and fire `change`. */
function choose(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
}

function transfer(files: File[], options: { viaItems?: boolean; types?: string[] } = {}): DataTransfer {
  return {
    files: options.viaItems ? [] : files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: options.types ?? ['Files'],
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

function dragEvent(type: string, data: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  return event;
}

describe('pickFile', () => {
  it('opens a hidden input with the requested options and resolves with the chosen files', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const promise = pickFile({ accept: ['image/*', ' .pdf '], multiple: true, capture: true });
    const input = pickerInput();
    expect(input).not.toBeNull();
    expect(click).toHaveBeenCalledTimes(1);
    expect(input?.accept).toBe('image/*,.pdf');
    expect(input?.multiple).toBe(true);
    expect(input?.getAttribute('capture')).toBe('environment');
    expect(input?.getAttribute('aria-hidden')).toBe('true');

    const photo = new File(['x'], 'sheet.jpg', { type: 'image/jpeg' });
    choose(input as HTMLInputElement, [photo]);
    await expect(promise).resolves.toEqual([photo]);
    expect(pickerInput()).toBeNull(); // the transient input is gone
    click.mockRestore();
  });

  it('resolves with nothing when the picker is cancelled', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const promise = pickFile();
    pickerInput()?.dispatchEvent(new Event('cancel'));
    await expect(promise).resolves.toEqual([]);
    expect(pickerInput()).toBeNull();
    vi.restoreAllMocks();
  });

  it('on browsers without a cancel event, notices a dismissed picker some time after focus returns', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    let settled: File[] | null = null;
    void pickFile().then((files) => {
      settled = files;
    });
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(9000);
    expect(settled).toBeNull(); // a phone may still be handing over a photo
    await vi.advanceTimersByTimeAsync(1500);
    expect(settled).toEqual([]);
    vi.restoreAllMocks();
  });

  it('does not lose a file that arrives after the window regained focus', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const promise = pickFile();
    const input = pickerInput() as HTMLInputElement;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(4000);
    const photo = new File(['x'], 'camera.jpg', { type: 'image/jpeg' });
    choose(input, [photo]);
    await expect(promise).resolves.toEqual([photo]);
    vi.restoreAllMocks();
  });

  it('pickOneFile gives the file or null', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const one = pickOneFile({ accept: '.gp' });
    expect(pickerInput()?.multiple).toBe(false);
    const file = new File(['x'], 'riff.gp');
    choose(pickerInput() as HTMLInputElement, [file]);
    await expect(one).resolves.toBe(file);

    const none = pickOneFile();
    pickerInput()?.dispatchEvent(new Event('cancel'));
    await expect(none).resolves.toBeNull();
    vi.restoreAllMocks();
  });
});

describe('paste', () => {
  it('collects files from `files`, or from `items` when `files` is empty', () => {
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });
    const doc = new File(['x'], 'tab.txt', { type: 'text/plain' });
    expect(filesFromDataTransfer(transfer([shot, doc]))).toEqual([shot, doc]);
    expect(filesFromDataTransfer(transfer([shot, doc], { viaItems: true }), 'image/*')).toEqual([shot]);
    expect(filesFromDataTransfer(null)).toEqual([]);
  });

  it('hands pasted images to the handler and leaves other pastes alone', () => {
    const handler = vi.fn();
    const stop = onPasteImage(handler);
    const shot = new File(['x'], 'shot.png', { type: 'image/png' });

    const imagePaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', { value: transfer([shot], { viaItems: true }) });
    document.body.dispatchEvent(imagePaste);
    expect(handler).toHaveBeenCalledWith([shot]);
    expect(imagePaste.defaultPrevented).toBe(true);

    const textPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', { value: transfer([]) });
    document.body.dispatchEvent(textPaste);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(textPaste.defaultPrevented).toBe(false); // typing into a text field still works

    stop();
    document.body.dispatchEvent(imagePaste);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('attachDropZone', () => {
  it('reports hover once across nested elements, then the dropped files split by accept', () => {
    const zone = document.createElement('div');
    const child = document.createElement('span');
    zone.appendChild(child);
    document.body.appendChild(zone);
    const onFiles = vi.fn();
    const onHover = vi.fn();
    const detach = attachDropZone(zone, { accept: 'image/*,.pdf', onFiles, onHover });

    const photo = new File(['x'], 'sheet.jpg', { type: 'image/jpeg' });
    const pdf = new File(['x'], 'Sor-Op60.PDF', { type: '' });
    const exe = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    const data = transfer([photo, pdf, exe]);

    zone.dispatchEvent(dragEvent('dragenter', data));
    child.dispatchEvent(dragEvent('dragenter', data));
    child.dispatchEvent(dragEvent('dragleave', data));
    expect(onHover.mock.calls).toEqual([[true]]);

    const over = dragEvent('dragover', data);
    zone.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true); // otherwise the browser would open the file

    const drop = dragEvent('drop', data);
    child.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onHover.mock.calls).toEqual([[true], [false]]);
    expect(onFiles).toHaveBeenCalledWith([photo, pdf], [exe]);

    detach();
    zone.dispatchEvent(dragEvent('drop', data));
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('ignores drags that carry no files and can keep only one file', () => {
    const zone = document.createElement('div');
    document.body.appendChild(zone);
    const onFiles = vi.fn();
    const onHover = vi.fn();
    attachDropZone(zone, { multiple: false, onFiles, onHover });

    const textDrag = transfer([], { types: ['text/plain'] });
    const over = dragEvent('dragover', textDrag);
    zone.dispatchEvent(dragEvent('dragenter', textDrag));
    zone.dispatchEvent(over);
    zone.dispatchEvent(dragEvent('drop', textDrag));
    expect(onHover).not.toHaveBeenCalled();
    expect(over.defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();

    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    zone.dispatchEvent(dragEvent('drop', transfer([a, b])));
    expect(onFiles).toHaveBeenCalledWith([a], []);
  });
});
