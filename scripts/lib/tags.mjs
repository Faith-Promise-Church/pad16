// File-name tags for the kit scripts. Mirrors src/engine/tags.ts (a unit test keeps the two in step).
//   "05 Snare.wav"                  pad 5
//   "Groove [loop] [92bpm] [4bars]" loop, source tempo 92, four bars long
//   "Shaker 92bpm [group:a]"        tempo without brackets, exclusive group A
export function parseTags(file) {
  let base = file.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const t = { name: '' };
  base = base.replace(/\s*\[(loop|hold|oneshot|one shot)\]\s*/gi, (_, m) => { t.mode = m.toLowerCase().replace(' ', ''); return ' '; });
  base = base.replace(/\s*\[(\d{2,3}(?:\.\d+)?)\s*bpm\]\s*/gi, (_, n) => { t.bpm = parseFloat(n); return ' '; });
  base = base.replace(/\s*\[(\d{1,2})\s*bars?\]\s*/gi, (_, n) => { t.bars = parseInt(n, 10); return ' '; });
  base = base.replace(/\s*\[group:\s*([a-d])\]\s*/gi, (_, g) => { t.group = g.toUpperCase(); return ' '; });
  base = base.replace(/\s*\[baked\]\s*/gi, () => { t.baked = true; return ' '; });
  if (t.bpm === undefined) base = base.replace(/(^|[\s_\-.])(\d{2,3}(?:\.\d+)?)\s*bpm(?=$|[\s_\-.])/i, (_, pre, n) => { t.bpm = parseFloat(n); return pre; });
  if (t.bars === undefined) base = base.replace(/(^|[\s_\-.])(\d{1,2})\s*bars?(?=$|[\s_\-.])/i, (_, pre, n) => { t.bars = parseInt(n, 10); return pre; });
  const m = base.match(/^\s*(\d{1,2})(?:[\s._-]+|$)(.*)$/);
  if (m && +m[1] >= 1 && +m[1] <= 16) { t.pad = +m[1]; base = m[2]; }
  if (t.bpm !== undefined && (t.bpm < 30 || t.bpm > 300)) delete t.bpm;
  if (t.bars !== undefined && (t.bars < 1 || t.bars > 64)) delete t.bars;
  t.name = base.replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-.]+|[\s\-.]+$/g, '').slice(0, 40);
  return t;
}
/** The tags written back into a prepared file name, so nothing is lost on the way through prepare-kit. */
export function tagSuffix(t) {
  return (t.mode && t.mode !== 'oneshot' ? ` [${t.mode}]` : '') + (t.bpm ? ` [${+t.bpm.toFixed(2)}bpm]` : '') + (t.bars ? ` [${t.bars}bars]` : '') + (t.group ? ` [group:${t.group.toLowerCase()}]` : '');
}
const KEYS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** "Pad Db.wav" or "Pad C# [baked].wav" gives the key 0..11, otherwise -1. */
export function padKey(file) {
  const m = /^\s*pad[\s_-]+([A-Ga-g])([#b]?)(?=$|[\s._\-\[])/i.exec(file.replace(/\.[A-Za-z0-9]{2,5}$/, ''));
  if (!m) return -1;
  return (KEYS[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}
/** "Click Accent.wav", "Click Beat.wav" or "Click Sub.wav" gives the click slot, otherwise null. */
export function clickSlot(file) {
  const m = /^\s*click[\s_-]+(accent|beat|sub)(?:division)?(?=$|[\s._\-\[])/i.exec(file.replace(/\.[A-Za-z0-9]{2,5}$/, ''));
  return m ? m[1].toLowerCase() : null;
}
