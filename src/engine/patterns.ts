// Drum machine patterns: the model, rendering to timed events, and the starter set.
import { TimeSig, beatsPerBar, subsPerBeat, swingOffset } from './time';

export type TrackSrc = { t: 'synth'; id: string } | { t: 'pad'; i: number } | { t: 'kit'; kit: string; file: string } | { t: 'audio'; id: string };
export interface Track { name: string; src: TrackSrc; level: number; mute: boolean; steps: number[] }
export interface Pattern {
  id: string; name: string; bars: 1 | 2 | 4; grid: '16' | '3'; swing: number;
  /** Steps per beat and beats per bar the pattern was written in. */
  spb: number; bpb: number; tracks: Track[];
  /** The meter it was written in. */
  ts?: TimeSig;
}
export interface PatternEvent { beat: number; track: number; vel: number }
/** Step values: 0 off, 1 ghost, 2 normal, 3 accent. */
export const STEP_VEL = [0, 0.35, 0.75, 1];
export const TRACKS = 8;

export const patternSteps = (p: Pattern) => p.bars * p.bpb * p.spb;
export const patternBeats = (p: Pattern) => p.bars * p.bpb;
export function gridFor(ts: TimeSig, grid: '16' | '3'): { spb: number; bpb: number } {
  return { spb: subsPerBeat(ts, grid === '16' ? '16' : '3'), bpb: beatsPerBar(ts) };
}

/** Events for one pass of the pattern, as beat offsets from its start, sorted by time. */
export function renderPattern(p: Pattern): PatternEvent[] {
  const total = patternSteps(p), out: PatternEvent[] = [];
  const swing = p.grid === '16' && p.spb % 2 === 0 ? p.swing : 50;
  p.tracks.forEach((tr, ti) => {
    if (tr.mute) return;
    for (let s = 0; s < total; s++) {
      const v = tr.steps[s] | 0;
      if (v > 0) out.push({ beat: (s + swingOffset(s, swing)) / p.spb, track: ti, vel: STEP_VEL[Math.min(3, v)] * tr.level });
    }
  });
  return out.sort((a, b) => a.beat - b.beat || a.track - b.track);
}

export function emptyPattern(id: string, name: string, ts: TimeSig, bars: 1 | 2 | 4 = 1, grid: '16' | '3' = '16'): Pattern {
  const g = gridFor(ts, grid), n = bars * g.bpb * g.spb;
  const names: Array<[string, string]> = [['Stomp', 'stomp'], ['Cajon Bass', 'cajon-bass'], ['Clap', 'clap'], ['Cajon Slap', 'cajon-slap'],
    ['Snap', 'snap'], ['Shaker Fwd', 'shaker-forward'], ['Shaker Back', 'shaker-back'], ['Tambourine', 'tambourine-no-head']];
  return { id, name, bars, grid, swing: 50, ...g, ts, tracks: names.map(([nm, sid]) => ({ name: nm, src: { t: 'synth', id: sid }, level: 1, mute: false, steps: new Array(n).fill(0) })) };
}

/** Re-grid a pattern for a new length, grid or meter, keeping steps that still land on the new grid. */
export function resizePattern(p: Pattern, ts: TimeSig, bars: 1 | 2 | 4, grid: '16' | '3'): Pattern {
  const g = gridFor(ts, grid), n = bars * g.bpb * g.spb, oldN = patternSteps(p);
  const tracks = p.tracks.map(tr => {
    const steps = new Array(n).fill(0);
    for (let s = 0; s < oldN; s++) {
      if (!tr.steps[s]) continue;
      const pos = (s / p.spb) * g.spb;                       // same beat position on the new grid
      if (Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) < n) steps[Math.round(pos)] = tr.steps[s];
    }
    // growing: repeat what was there
    if (n > (oldN / p.spb) * g.spb) { const base = Math.round((oldN / p.spb) * g.spb); for (let s = base; s < n && base > 0; s++) steps[s] = steps[s % base]; }
    return { ...tr, steps };
  });
  return { ...p, bars, grid, ...g, ts, tracks };
}

type Row = [name: string, synth: string, steps: string, level?: number];
/** Step strings: '.' off, 'g' ghost, 'x' normal, 'X' accent. Spaces are ignored. */
function build(id: string, name: string, ts: TimeSig, bars: 1 | 2 | 4, rows: Row[], swing = 50, grid: '16' | '3' = '16'): Pattern {
  const p = emptyPattern(id, name, ts, bars, grid), n = patternSteps(p);
  p.swing = swing;
  p.tracks = p.tracks.map((tr, i) => {
    const row = rows[i];
    if (!row) return { ...tr, steps: new Array(n).fill(0) };
    const chars = row[2].replace(/\s/g, '');
    const steps = Array.from({ length: n }, (_, s) => ({ '.': 0, g: 1, x: 2, X: 3 } as Record<string, number>)[chars[s % chars.length]] ?? 0);
    return { name: row[0], src: { t: 'synth', id: row[1] } as TrackSrc, level: row[3] ?? 1, mute: false, steps };
  });
  return p;
}
const T44: TimeSig = { num: 4, den: 4 }, T68: TimeSig = { num: 6, den: 8 };

export function starterPatterns(): Pattern[] {
  return [
    build('starter-stomp-clap', 'Stomp and clap', T44, 1, [
      ['Stomp', 'stomp',            'X... X... X... X...'],
      ['Group Stomp', 'group-stomp', '.... .... .... ....'],
      ['Clap', 'clap',              '.... X... .... X...'],
      ['Group Clap', 'group-clap',  '.... .... .... ....'],
      ['Snap', 'snap',              '.... .... .... ....'],
      ['Shaker Fwd', 'shaker-forward', '.... .... .... ....'],
      ['Shaker Back', 'shaker-back',   '.... .... .... ....'],
      ['Tambourine', 'tambourine-no-head', '..x. ..x. ..x. ..x.', 0.6],
    ]),
    build('starter-cajon', 'Cajon groove', T44, 2, [
      ['Cajon Bass', 'cajon-bass', 'X... ...x ..x. .... X... ...x .xx. ....'],
      ['Cajon Slap', 'cajon-slap', '.... X... .... X..g .... X... .... X.gx'],
      ['Ghost Slap', 'cajon-slap', '..g. ..g. g... ..g. ..g. ..g. g... ....', 0.7],
      ['Snap', 'snap',             '.... .... .... ....'],
      ['Clap', 'clap',             '.... .... .... ....'],
      ['Shaker Fwd', 'shaker-forward', 'x.x. x.x. x.x. x.x.', 0.5],
      ['Shaker Back', 'shaker-back',   '.g.g .g.g .g.g .g.g', 0.5],
      ['Tambourine', 'tambourine-no-head', '.... .... .... ....'],
    ], 54),
    build('starter-train', 'Train-beat shaker', T44, 1, [
      ['Stomp', 'stomp',                'X... .... x... ....'],
      ['Shaker Accent', 'shaker-accent', '.... X... .... X.x.'],
      ['Shaker Fwd', 'shaker-forward',   'x.x. ..x. x.x. ....'],
      ['Shaker Back', 'shaker-back',     '.g.g .g.g .g.g .g.g'],
      ['Clap', 'clap',                   '.... .... .... ....'],
      ['Snap', 'snap',                   '.... .... .... ....'],
      ['Cajon Slap', 'cajon-slap',       '.... .... .... ....'],
      ['Tambourine', 'tambourine-head',  '.... .... .... ....'],
    ]),
    // 6/8: two dotted-quarter beats, six steps each. Eighths fall on every second step.
    build('starter-68-ballad', '6/8 ballad', T68, 1, [
      ['Cajon Bass', 'cajon-bass',  'X..... ....x.'],
      ['Cajon Slap', 'cajon-slap',  '...... X.....'],
      ['Shaker Fwd', 'shaker-forward', 'X.x.x. X.x.x.', 0.55],
      ['Shaker Back', 'shaker-back',   '...... ......'],
      ['Snap', 'snap',              '...... ......'],
      ['Clap', 'clap',              '...... ......'],
      ['Stomp', 'stomp',            '...... ......'],
      ['Tambourine', 'tambourine-no-head', '...... ......'],
    ]),
    build('starter-half-time', 'Half time', T44, 2, [
      ['Thick Kick', 'thick-kick', 'X... .... .... ..x. X... ...x .... ....'],
      ['Snare', 'snare',           '.... .... X... .... .... .... X... ...g'],
      ['Clap', 'group-clap',       '.... .... .... .... .... .... x... ....', 0.6],
      ['Shaker Fwd', 'shaker-forward', 'x... x... x... x...', 0.5],
      ['Shaker Back', 'shaker-back',   '..g. ..g. ..g. ..g.', 0.5],
      ['Snap', 'snap',             '.... .... .... ....'],
      ['Stomp', 'stomp',           '.... .... .... ....'],
      ['Tambourine', 'tambourine-head', '.... .... .... ....'],
    ]),
    build('starter-build', 'Build', T44, 4, [
      ['Stomp', 'stomp',             'x... x... x... x... x.x. x.x. x.x. x.x. xgxg xgxg xxxx xxxx XxXx XxXx XXXX XXXX'],
      ['Group Stomp', 'group-stomp', '.... .... .... .... .... .... .... .... x... x... x... x... X... X... X.X. XXXX'],
      ['Clap', 'clap',               '.... .... .... .... .... x... .... x... .... x... .... x... .... .... .... ....'],
      ['Group Clap', 'group-clap',   '.... .... .... .... .... .... .... .... .... .... .... .... X... X... X... X.X.'],
      ['Tambourine', 'tambourine-no-head', '.... .... .... .... ..x. ..x. ..x. ..x. x.x. x.x. x.x. x.x. xxxx xxxx xxxx xxxx', 0.6],
      ['Snap', 'snap',               '.... .... .... ....'],
      ['Shaker Fwd', 'shaker-forward', '.... .... .... ....'],
      ['Shaker Back', 'shaker-back',   '.... .... .... ....'],
    ]),
  ];
}
