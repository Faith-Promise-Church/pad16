// The kit scripts are plain JavaScript so they run on any Node. These tests keep them in step with the app's own code.
import { describe, it, expect } from 'vitest';
// @ts-ignore: plain JS module
import { parseTags as scriptParse, padKey, tagSuffix, clickSlot } from '../../scripts/lib/tags.mjs';
// @ts-ignore: plain JS module
import { bakeLoop, writeWav16, readWav16 } from '../../scripts/lib/wav.mjs';
import { parseTags } from '../../src/engine/tags';
import { bakeLoopCrossfade, decodeWav } from '../../src/engine/dsp';

describe('kit scripts', () => {
  it('parse file names exactly as the app does', () => {
    for (const f of ['05 Snare.wav', '12 Swell [loop].wav', 'Kick.wav', 'Groove [loop] [92bpm] [4bars].wav', '9 Shaker 92bpm [group:a].wav', 'Cajon_118.5bpm_2bars.wav',
      '808 Kick.wav', 'Take 2.wav', 'Loop [999bpm].wav', '17 Too High.wav', 'Pad C [baked].wav', '3_Pad_Swell [hold].m4a']) {
      expect(scriptParse(f), f).toEqual(parseTags(f));
    }
  });
  it('write tags back so they survive prepare-kit', () => {
    const t = scriptParse('9 Groove [loop] [92bpm] [4bars] [group:b].wav');
    expect(scriptParse('9 ' + t.name + tagSuffix(t) + '.wav')).toEqual(t);
  });
  it('recognize pad files by key', () => {
    expect(padKey('Pad C.wav')).toBe(0); expect(padKey('Pad Db.wav')).toBe(1); expect(padKey('pad F# [baked].wav')).toBe(6);
    expect(padKey('Pad Bb.aif')).toBe(10); expect(padKey('Pad_A.wav')).toBe(9); expect(padKey('Paddle.wav')).toBe(-1); expect(padKey('Pad Swell.wav')).toBe(-1); expect(padKey('3 Pad.wav')).toBe(-1);
  });
  it('recognize click set files', () => {
    expect(clickSlot('Click Accent.wav')).toBe('accent'); expect(clickSlot('click beat.wav')).toBe('beat'); expect(clickSlot('Click_Sub.wav')).toBe('sub');
    expect(clickSlot('Click Subdivision.wav')).toBe('sub'); expect(clickSlot('Click Loop 80bpm.wav')).toBeNull(); expect(clickSlot('Clicker Accent.wav')).toBeNull();
  });
  it('bake the same crossfade as the app and round-trip WAV', () => {
    const x = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i * 0.07) * 0.5);
    expect(Array.from(bakeLoop(x, 800))).toEqual(Array.from(bakeLoopCrossfade(x, 800)));
    const back = readWav16(writeWav16([x], 48000));
    expect(back.sampleRate).toBe(48000); expect(back.channels[0].length).toBe(4000);
    expect(decodeWav(writeWav16([x], 48000)).channels[0][100]).toBeCloseTo(x[100], 3);
  });
});
