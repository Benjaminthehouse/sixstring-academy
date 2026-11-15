/**
 * Minimal WAV (RIFF) encoder/decoder. Used to write test fixtures (a synthesised guitar note as the
 * fake microphone for the tuner tests) and to let a learner export what the app rendered.
 */

/** Options for {@link encodeWav}. */
export interface WavOptions {
  /** 16 (default) or 24-bit PCM, or 32-bit float. */
  bitDepth?: 16 | 24 | 32;
  /** Interleave several equal-length channels instead of writing mono. */
  channels?: Float32Array[];
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Encode mono samples (range -1..1) as a WAV file. Returns the file bytes.
 * 16-bit output is rounded without dither: fixtures stay bit-for-bit deterministic.
 */
export function encodeWav(samples: Float32Array, sampleRate: number, opts: WavOptions = {}): Uint8Array {
  const chans = opts.channels && opts.channels.length ? opts.channels : [samples];
  const bitDepth = opts.bitDepth ?? 16;
  const bytesPer = bitDepth / 8;
  const frames = chans[0].length;
  const dataBytes = frames * chans.length * bytesPer;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 3 = IEEE float, 1 = PCM
  view.setUint16(22, chans.length, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * chans.length * bytesPer, true);
  view.setUint16(32, chans.length * bytesPer, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chans.length; c++) {
      const v = chans[c][i];
      const s = v !== v ? 0 : v > 1 ? 1 : v < -1 ? -1 : v;
      if (bitDepth === 16) {
        view.setInt16(o, Math.round(s * 32767), true);
      } else if (bitDepth === 24) {
        const n = Math.round(s * 8388607);
        view.setUint8(o, n & 0xff);
        view.setUint8(o + 1, (n >> 8) & 0xff);
        view.setUint8(o + 2, (n >> 16) & 0xff);
      } else {
        view.setFloat32(o, s, true);
      }
      o += bytesPer;
    }
  }
  return out;
}

/** Decoded WAV audio. */
export interface DecodedWav {
  sampleRate: number;
  channels: Float32Array[];
}

/** Decode a PCM (8/16/24/32-bit) or float WAV file. Throws on anything that is not a WAV. */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let o = 12;
  let format = 1, nch = 1, rate = 44100, bits = 16;
  let dataStart = -1, dataLen = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const len = view.getUint32(o + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(o + 8, true);
      nch = view.getUint16(o + 10, true);
      rate = view.getUint32(o + 12, true);
      bits = view.getUint16(o + 22, true);
    } else if (id === 'data') {
      dataStart = o + 8;
      dataLen = Math.min(len, bytes.length - dataStart);
      break;
    }
    o += 8 + len + (len & 1);
  }
  if (dataStart < 0) throw new Error('WAV has no data chunk');
  const bytesPer = bits / 8;
  const frames = Math.floor(dataLen / (bytesPer * nch));
  const channels = Array.from({ length: nch }, () => new Float32Array(frames));
  let p = dataStart;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      let v = 0;
      if (format === 3 && bits === 32) v = view.getFloat32(p, true);
      else if (bits === 16) v = view.getInt16(p, true) / 32768;
      else if (bits === 24) v = ((view.getInt8(p + 2) << 16) | (view.getUint8(p + 1) << 8) | view.getUint8(p)) / 8388608;
      else if (bits === 32) v = view.getInt32(p, true) / 2147483648;
      else if (bits === 8) v = (view.getUint8(p) - 128) / 128;
      channels[c][i] = v;
      p += bytesPer;
    }
  }
  return { sampleRate: rate, channels };
}
