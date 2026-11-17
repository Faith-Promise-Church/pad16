// Pure sample-level helpers. No Web Audio, so they run in Node, in a Worker and in tests.

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass';
/** RBJ biquad run over a signal in place. Returns the same array. */
export function biquad(x: Float32Array, sr: number, type: BiquadType, f: number, q = 0.707): Float32Array {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

/** Bake an equal-power crossfade into the loop point. The result is shorter by the fade length and loops seamlessly. */
export function bakeLoopCrossfade(ch: Float32Array, fadeSamples: number): Float32Array {
  const n = ch.length, x = Math.max(0, Math.min(Math.floor(fadeSamples), Math.floor(n / 2)));
  if (x < 2) return ch.slice();
  const out = new Float32Array(n - x);
  out.set(ch.subarray(0, n - x));
  for (let i = 0; i < x; i++) {
    const th = (i / x) * (Math.PI / 2);
    out[i] = ch[i] * Math.sin(th) + ch[n - x + i] * Math.cos(th);
  }
  return out;
}

export function peak(chs: Float32Array[]): number {
  let p = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}
export function normalize(chs: Float32Array[], target = 0.89): void {
  const p = peak(chs); if (p < 1e-6) return;
  const g = target / p; for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
}

/** 16-bit PCM WAV. */
export function encodeWav(chs: Float32Array[], sr: number): Uint8Array {
  const n = chs[0].length, nc = chs.length, bytes = new Uint8Array(44 + n * nc * 2), v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const s = Math.max(-1, Math.min(1, chs[c][i]));
    v.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true); o += 2;
  }
  return bytes;
}

/** Decode PCM WAV (16, 24 or 32 bit integer, or 32 bit float). Enough for files this project writes. */
export function decodeWav(buf: ArrayBuffer | Uint8Array): { channels: Float32Array[]; sampleRate: number } {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 12, fmt = 1, nc = 1, sr = 48000, bits = 16, dataO = -1, dataN = 0;
  while (o + 8 <= v.byteLength) {
    const id = String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') { fmt = v.getUint16(o + 8, true); nc = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    else if (id === 'data') { dataO = o + 8; dataN = Math.min(size, v.byteLength - dataO); break; }
    o += 8 + size + (size & 1);
  }
  if (dataO < 0) throw new Error('Not a WAV file');
  const bps = bits / 8, n = Math.floor(dataN / (bps * nc));
  const channels = Array.from({ length: nc }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const p = dataO + (i * nc + c) * bps;
    channels[c][i] = fmt === 3 ? v.getFloat32(p, true)
      : bits === 16 ? v.getInt16(p, true) / 32768
      : bits === 24 ? ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 8388608)
      : v.getInt32(p, true) / 2147483648;
  }
  return { channels, sampleRate: sr };
}

/** Equal-power fade curves for setValueCurveAtTime. */
export function fadeCurve(dir: 'in' | 'out', n = 64): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const th = (i / (n - 1)) * (Math.PI / 2); c[i] = dir === 'in' ? Math.sin(th) : Math.cos(th); }
  return c;
}
