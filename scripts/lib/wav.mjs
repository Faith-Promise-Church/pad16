// Minimal 16-bit PCM WAV reading and writing, and the loop crossfade, for the kit scripts.
// The crossfade matches bakeLoopCrossfade in src/engine/dsp.ts.
export function readWav16(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 12, nc = 1, sr = 48000, dataO = -1, dataN = 0;
  while (o + 8 <= v.byteLength) {
    const id = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') { nc = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); }
    else if (id === 'data') { dataO = o + 8; dataN = Math.min(size, v.byteLength - dataO); break; }
    o += 8 + size + (size & 1);
  }
  if (dataO < 0) throw new Error('Not a WAV file');
  const n = Math.floor(dataN / (2 * nc)), channels = Array.from({ length: nc }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) channels[c][i] = v.getInt16(dataO + (i * nc + c) * 2, true) / 32768;
  return { channels, sampleRate: sr };
}
export function writeWav16(channels, sr) {
  const n = channels[0].length, nc = channels.length, out = Buffer.alloc(44 + n * nc * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * nc * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(nc, 22); out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * nc * 2, 28); out.writeUInt16LE(nc * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); out.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), o); o += 2; }
  return out;
}
/** Equal-power crossfade baked into the loop point. The result is shorter by the fade and loops seamlessly. */
export function bakeLoop(ch, fadeSamples) {
  const n = ch.length, x = Math.max(0, Math.min(Math.floor(fadeSamples), Math.floor(n / 2)));
  if (x < 2) return ch.slice();
  const out = new Float32Array(n - x);
  out.set(ch.subarray(0, n - x));
  for (let i = 0; i < x; i++) { const th = (i / x) * (Math.PI / 2); out[i] = ch[i] * Math.sin(th) + ch[n - x + i] * Math.cos(th); }
  return out;
}
