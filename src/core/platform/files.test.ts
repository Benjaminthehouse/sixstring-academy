import jpeg from 'jpeg-js';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  decodeText,
  exifOrientation,
  jpegInfo,
  matchesAccept,
  orientationTransform,
  readFileBytes,
  readFileDataUrl,
  readFileText,
  sniffBytes,
  sniffFile,
} from './files';

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

function pngBytes(width = 4, height = 3): Uint8Array {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return new Uint8Array(PNG.sync.write(png));
}

function jpegBytes(width = 8, height = 4): Uint8Array {
  const data = new Uint8Array(width * height * 4).fill(128);
  return new Uint8Array(jpeg.encode({ data, width, height }, 80).data);
}

/** Insert an EXIF block with one Orientation tag right after the JPEG start marker. */
function withExif(source: Uint8Array, orientation: number, littleEndian = true): Uint8Array {
  const tiff = littleEndian
    ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0, 0, 0, 0]
    : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  const segment = [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
  const out = new Uint8Array(source.length + segment.length);
  out.set(source.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(source.subarray(2), 2 + segment.length);
  return out;
}

async function zipBytes(files: Record<string, string>, options: { stream?: boolean } = {}): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content, name === 'mimetype' ? { compression: 'STORE' } : undefined);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', streamFiles: options.stream === true });
  return new Uint8Array(bytes);
}

const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><part-list/></score-partwise>`;

describe('sniffBytes', () => {
  it('recognises images by their signature', () => {
    expect(sniffBytes(pngBytes())).toMatchObject({ kind: 'png', family: 'image', mime: 'image/png' });
    expect(sniffBytes(jpegBytes())).toMatchObject({ kind: 'jpeg', family: 'image', mime: 'image/jpeg' });
    expect(sniffBytes(text('GIF89a\u0001\u0000\u0001\u0000'))).toMatchObject({ kind: 'gif', family: 'image' });
    const webp = new Uint8Array([...text('RIFF'), 0x24, 0, 0, 0, ...text('WEBPVP8 ')]);
    expect(sniffBytes(webp)).toMatchObject({ kind: 'webp', mime: 'image/webp' });
    const heic = new Uint8Array([0, 0, 0, 0x18, ...text('ftypheic'), 0, 0, 0, 0]);
    expect(sniffBytes(heic)).toMatchObject({ kind: 'heic', family: 'image' });
  });

  it('does not trust the file name over the content', () => {
    expect(sniffBytes(pngBytes(), 'holiday.jpg').kind).toBe('png');
    expect(sniffBytes(text('just some words'), 'score.pdf').kind).toBe('text');
  });

  it('recognises PDF, also behind a little leading junk', () => {
    expect(sniffBytes(text('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toMatchObject({ kind: 'pdf', family: 'document', mime: 'application/pdf' });
    expect(sniffBytes(text('\n\n   %PDF-1.4\n')).kind).toBe('pdf');
  });

  it('recognises MIDI files', () => {
    const midi = new Uint8Array([...text('MThd'), 0, 0, 0, 6, 0, 1, 0, 2, 0x03, 0xc0, ...text('MTrk')]);
    expect(sniffBytes(midi)).toMatchObject({ kind: 'midi', family: 'score', mime: 'audio/midi' });
    const rmid = new Uint8Array([...text('RIFF'), 0x40, 0, 0, 0, ...text('RMIDdata')]);
    expect(sniffBytes(rmid).kind).toBe('midi');
  });

  it('tells MusicXML from other XML and from plain text', () => {
    expect(sniffBytes(text(MUSICXML))).toMatchObject({ kind: 'musicxml', family: 'score' });
    expect(sniffBytes(text('<score-partwise version="3.1"><part-list/></score-partwise>')).kind).toBe('musicxml');
    expect(sniffBytes(text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({ kind: 'xml', family: 'text' });
    expect(sniffBytes(text('<?xml version="1.0"?>\n<!-- a long comment -->'), 'tune.musicxml').kind).toBe('musicxml');
    expect(sniffBytes(text('e|---0---3---|\nB|---1---0---|\n'))).toMatchObject({ kind: 'text', mime: 'text/plain' });
    expect(sniffBytes(text('{title: Greensleeves}\n[Am]Alas my [C]love'))).toMatchObject({ kind: 'text' });
  });

  it('reads UTF-16 XML and text through the byte-order mark', () => {
    const utf16 = (s: string): Uint8Array => {
      const out = new Uint8Array(2 + s.length * 2);
      out[0] = 0xff;
      out[1] = 0xfe;
      for (let i = 0; i < s.length; i++) {
        out[2 + i * 2] = s.charCodeAt(i) & 0xff;
        out[3 + i * 2] = s.charCodeAt(i) >> 8;
      }
      return out;
    };
    expect(sniffBytes(utf16(MUSICXML)).kind).toBe('musicxml');
    expect(sniffBytes(utf16('plain words')).kind).toBe('text');
  });

  it('classifies zip archives by what is inside', async () => {
    const mxl = await zipBytes({
      mimetype: 'application/vnd.recordare.musicxml',
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
      'score.musicxml': MUSICXML,
    });
    expect(sniffBytes(mxl, 'whatever.zip')).toMatchObject({ kind: 'mxl', family: 'score' });

    const mxlNoMimetype = await zipBytes({ 'META-INF/container.xml': '<container/>', 'tune.xml': MUSICXML });
    expect(sniffBytes(mxlNoMimetype).kind).toBe('mxl');

    const gp = await zipBytes({ VERSION: '7.0', 'Content/score.gpif': '<GPIF><GPVersion>7</GPVersion></GPIF>', 'meta.json': '{}' });
    expect(sniffBytes(gp, 'song.zip')).toMatchObject({ kind: 'gp', detail: 'gp7', family: 'score' });

    const plain = await zipBytes({ 'notes.txt': 'hello', 'more/data.json': '{}' });
    expect(sniffBytes(plain)).toMatchObject({ kind: 'zip', family: 'archive' });
    expect(sniffBytes(plain, 'song.gp')).toMatchObject({ kind: 'gp', detail: 'gp7' });
    expect(sniffBytes(plain, 'song.MXL').kind).toBe('mxl');

    const docx = await zipBytes({ '[Content_Types].xml': '<Types/>', 'META-INF/container.xml': '<x/>', 'word/document.xml': '<w/>' });
    expect(sniffBytes(docx).kind).toBe('zip');
  });

  it('finds entry names in zips written with data descriptors', async () => {
    const streamed = await zipBytes({ VERSION: '7.0', 'Content/score.gpif': '<GPIF/>'.repeat(50) }, { stream: true });
    expect(sniffBytes(streamed)).toMatchObject({ kind: 'gp', detail: 'gp7' });
  });

  it('recognises older Guitar Pro files', () => {
    const gp5 = new Uint8Array([24, ...text('FICHIER GUITAR PRO v5.00'), 0, 0, 0, 0, 0, 0]);
    expect(sniffBytes(gp5)).toMatchObject({ kind: 'gp', detail: 'gp5', family: 'score' });
    const gp3 = new Uint8Array([24, ...text('FICHIER GUITAR PRO v3.00'), 0, 0, 0, 0, 0, 0]);
    expect(sniffBytes(gp3).detail).toBe('gp3');
    expect(sniffBytes(new Uint8Array([...text('BCFZ'), 1, 2, 3, 4, 0, 0, 9, 9]))).toMatchObject({ kind: 'gp', detail: 'gpx' });
  });

  it('gives up politely on empty and binary input', () => {
    expect(sniffBytes(new Uint8Array(0))).toMatchObject({ kind: 'unknown', family: 'unknown', mime: 'application/octet-stream' });
    expect(sniffBytes(new Uint8Array([0, 1, 2, 3, 0, 0, 0, 250, 251, 0, 0])).kind).toBe('unknown');
  });

  it('sniffFile reads only the head of a blob and uses its name for ties', async () => {
    const big = new Uint8Array(200_000);
    big.set(pngBytes(), 0);
    expect((await sniffFile(new Blob([big]))).kind).toBe('png');
    const named = new File([await zipBytes({ 'a.txt': 'x' })], 'riff.gp');
    expect((await sniffFile(named)).kind).toBe('gp');
  });
});

describe('decodeText and the readers', () => {
  it('decodes UTF-8 with and without a byte-order mark', () => {
    expect(decodeText(text('Tárrega: Lágrima'))).toBe('Tárrega: Lágrima');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...text('Sor')]))).toBe('Sor');
  });

  it('decodes UTF-16 in both byte orders', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x6d, 0x00]))).toBe('Am');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x6d]))).toBe('Am');
  });

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    // "Tárrega" saved by an old Windows editor: á is the single byte E1.
    expect(decodeText(new Uint8Array([0x54, 0xe1, 0x72, 0x72, 0x65, 0x67, 0x61]))).toBe('Tárrega');
  });

  it('reads blobs as text, bytes and data URLs', async () => {
    const blob = new Blob([text('e|--0--|')], { type: 'text/plain' });
    expect(await readFileText(blob)).toBe('e|--0--|');
    expect(Array.from(await readFileBytes(blob))).toEqual(Array.from(text('e|--0--|')));
    expect(await readFileDataUrl(blob)).toBe(`data:text/plain;base64,${Buffer.from('e|--0--|').toString('base64')}`);
  });

  it('encodes large byte arrays to base64 without overflowing the stack', () => {
    const bytes = new Uint8Array(300_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('JPEG headers and EXIF orientation', () => {
  it('reads the stored size', () => {
    expect(jpegInfo(jpegBytes(8, 4))).toMatchObject({ width: 8, height: 4, orientation: null, hasExif: false });
  });

  it('reads the orientation tag in both byte orders', () => {
    for (const orientation of [1, 3, 6, 8]) {
      expect(exifOrientation(withExif(jpegBytes(), orientation, true))).toBe(orientation);
      expect(exifOrientation(withExif(jpegBytes(), orientation, false))).toBe(orientation);
    }
    expect(jpegInfo(withExif(jpegBytes(8, 4), 6))).toMatchObject({ width: 8, height: 4, orientation: 6, hasExif: true });
  });

  it('answers 1 for files without EXIF, damaged tags and non-JPEG input', () => {
    expect(exifOrientation(jpegBytes())).toBe(1);
    expect(exifOrientation(withExif(jpegBytes(), 9))).toBe(1);
    expect(exifOrientation(pngBytes())).toBe(1);
    expect(jpegInfo(pngBytes())).toBeNull();
    expect(exifOrientation(withExif(jpegBytes(), 6).subarray(0, 20))).toBe(1); // cut off inside the tag
  });

  it('gives the transform that turns each orientation upright', () => {
    // Map the four corners of a 4 x 2 stored image and check they land inside the upright box.
    for (let orientation = 1; orientation <= 8; orientation++) {
      const { matrix, width, height } = orientationTransform(orientation, 4, 2);
      const [a, b, c, d, e, f] = matrix;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [x, y] of [[0, 0], [4, 0], [0, 2], [4, 2]]) {
        xs.push(a * x + c * y + e);
        ys.push(b * x + d * y + f);
      }
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, width]);
      expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, height]);
      expect([width, height]).toEqual(orientation >= 5 ? [2, 4] : [4, 2]);
    }
    // Orientation 6 (camera turned clockwise): the stored top-left corner belongs at the top right.
    const six = orientationTransform(6, 4, 2).matrix;
    expect([six[4], six[5]]).toEqual([2, 0]);
    // Orientation 3 is a half turn: the stored top-left corner belongs at the bottom right.
    const three = orientationTransform(3, 4, 2).matrix;
    expect([three[4], three[5]]).toEqual([4, 2]);
  });
});

describe('matchesAccept', () => {
  it('matches extensions, exact types and wildcards without regard to case', () => {
    expect(matchesAccept({ name: 'Song.PDF', type: '' }, '.pdf')).toBe(true);
    expect(matchesAccept({ name: 'photo.heic', type: 'image/heic' }, 'image/*')).toBe(true);
    expect(matchesAccept({ name: 'tune.mid', type: 'audio/midi' }, ['audio/midi', '.musicxml'])).toBe(true);
    expect(matchesAccept({ name: 'tune.gp', type: '' }, 'image/*, .pdf')).toBe(false);
    expect(matchesAccept({ name: 'notes.txt', type: 'text/plain' }, 'TEXT/PLAIN')).toBe(true);
  });

  it('accepts everything when there is no list', () => {
    expect(matchesAccept({ name: 'anything.bin', type: '' }, undefined)).toBe(true);
    expect(matchesAccept({ name: 'anything.bin', type: '' }, ' , ')).toBe(true);
  });
});
