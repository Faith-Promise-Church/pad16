// File-name tags shared by the app and the kit scripts.
//   "05 Snare.wav"                  pad 5
//   "Groove [loop] [92bpm] [4bars]" loop, source tempo 92, four bars long
//   "Shaker 92bpm [group:a]"        tempo without brackets, exclusive group A
export type PadMode = 'oneshot' | 'hold' | 'loop' | 'pattern';
export interface Tags { pad?: number; name: string; mode?: PadMode; bpm?: number; bars?: number; group?: 'A' | 'B' | 'C' | 'D'; baked?: boolean }

export function parseTags(file: string): Tags {
  let base = file.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const t: Tags = { name: '' };
  base = base.replace(/\s*\[(loop|hold|oneshot|one shot)\]\s*/gi, (_, m: string) => { t.mode = m.toLowerCase().replace(' ', '') as PadMode; return ' '; });
  base = base.replace(/\s*\[(\d{2,3}(?:\.\d+)?)\s*bpm\]\s*/gi, (_, n: string) => { t.bpm = parseFloat(n); return ' '; });
  base = base.replace(/\s*\[(\d{1,2})\s*bars?\]\s*/gi, (_, n: string) => { t.bars = parseInt(n, 10); return ' '; });
  base = base.replace(/\s*\[group:\s*([a-d])\]\s*/gi, (_, g: string) => { t.group = g.toUpperCase() as 'A'; return ' '; });
  base = base.replace(/\s*\[baked\]\s*/gi, () => { t.baked = true; return ' '; });
  if (t.bpm === undefined) {
    base = base.replace(/(^|[\s_\-.])(\d{2,3}(?:\.\d+)?)\s*bpm(?=$|[\s_\-.])/i, (_, pre: string, n: string) => { t.bpm = parseFloat(n); return pre; });
  }
  if (t.bars === undefined) {
    base = base.replace(/(^|[\s_\-.])(\d{1,2})\s*bars?(?=$|[\s_\-.])/i, (_, pre: string, n: string) => { t.bars = parseInt(n, 10); return pre; });
  }
  const m = base.match(/^\s*(\d{1,2})(?:[\s._-]+|$)(.*)$/);
  if (m && +m[1] >= 1 && +m[1] <= 16) { t.pad = +m[1]; base = m[2]; }
  if (t.bpm !== undefined && (t.bpm < 30 || t.bpm > 300)) delete t.bpm;
  if (t.bars !== undefined && (t.bars < 1 || t.bars > 64)) delete t.bars;
  t.name = base.replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-.]+|[\s\-.]+$/g, '').slice(0, 40);
  return t;
}
