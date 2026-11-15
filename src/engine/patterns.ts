// Drum machine patterns: the model, rendering to timed events, and the starter set.
import { TimeSig, beatsPerBar, subsPerBeat, swingOffset } from './time';

export type TrackSrc = { t: 'synth'; id: string } | { t: 'pad'; i: number } | { t: 'kit'; kit: string; file: string } | { t: 'audio'; id: string };
export interface Track {
  name: string; src: TrackSrc; level: number; mute: boolean; steps: number[];
  /** A new hit cuts the one before it, the way a kick drum or a hand on a cajon does. Keeps busy patterns clean. */
  choke?: boolean;
}
export interface Pattern {
  id: string; name: string; bars: 1 | 2 | 4; grid: '16' | '3'; swing: number;
  /** Steps per beat and beats per bar the pattern was written in. */
  spb: number; bpb: number; tracks: Track[];
  /** Step scale. 8 means steps hold a level from 1 to 8. Patterns saved before that used 1 ghost, 2 normal, 3 accent. */
  lv?: 8;
  /** The meter it was written in. */
  ts?: TimeSig;
}
export interface PatternEvent { beat: number; track: number; vel: number }
/** Step values: 0 is off, 1 to 8 are levels. Each level is an eighth of full level, so 8 levels give 18 dB of range. */
export const LEVELS = 8;
export const LEVEL_NORMAL = 6, LEVEL_GHOST = 3, LEVEL_ACCENT = 8;
export const stepVel = (v: number) => Math.min(LEVELS, Math.max(0, v | 0)) / LEVELS;
/** Bring a pattern saved on the old three-level scale (ghost, normal, accent) onto the eight-level scale. */
export function upgradePattern(p: Pattern): Pattern {
  if (p.lv === 8) return p;
  const map = [0, LEVEL_GHOST, LEVEL_NORMAL, LEVEL_ACCENT];
  return { ...p, lv: 8, tracks: p.tracks.map(t => ({ ...t, steps: t.steps.map(v => map[Math.min(3, Math.max(0, v | 0))]) })) };
}
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
      if (v > 0) out.push({ beat: (s + swingOffset(s, swing)) / p.spb, track: ti, vel: stepVel(v) * tr.level });
    }
  });
  return out.sort((a, b) => a.beat - b.beat || a.track - b.track);
}

export function emptyPattern(id: string, name: string, ts: TimeSig, bars: 1 | 2 | 4 = 1, grid: '16' | '3' = '16'): Pattern {
  const g = gridFor(ts, grid), n = bars * g.bpb * g.spb;
  const names: Array<[string, string]> = [['Stomp', 'stomp'], ['Cajon Bass', 'cajon-bass'], ['Clap', 'clap'], ['Cajon Slap', 'cajon-slap'],
    ['Snap', 'snap'], ['Shaker Fwd', 'shaker-forward'], ['Shaker Back', 'shaker-back'], ['Tambourine', 'tambourine-no-head']];
  return { id, name, bars, grid, swing: 50, ...g, ts, lv: 8, tracks: names.map(([nm, sid]) => ({ name: nm, src: { t: 'synth', id: sid }, level: 1, mute: false, steps: new Array(n).fill(0) })) };
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

type Row = [name: string, src: string | TrackSrc, steps: string, level?: number, choke?: boolean];
const kit = (k: string, file: string): TrackSrc => ({ t: 'kit', kit: k, file });
/** Step strings: '.' off, digits 1 to 8 are levels, 'g' ghost (3), 'x' normal (6), 'X' accent (8). Spaces and bars are ignored. */
const CHAR: Record<string, number> = { '.': 0, g: LEVEL_GHOST, x: LEVEL_NORMAL, X: LEVEL_ACCENT, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8 };
function build(id: string, name: string, ts: TimeSig, bars: 1 | 2 | 4, rows: Row[], swing = 50, grid: '16' | '3' = '16'): Pattern {
  const p = emptyPattern(id, name, ts, bars, grid), n = patternSteps(p);
  p.swing = swing;
  p.tracks = p.tracks.map((tr, i) => {
    const row = rows[i];
    if (!row) return { ...tr, steps: new Array(n).fill(0) };
    const chars = row[2].replace(/[\s|]/g, '');
    const steps = Array.from({ length: n }, (_, s) => CHAR[chars[s % chars.length]] ?? 0);
    const src: TrackSrc = typeof row[1] === 'string' ? { t: 'synth', id: row[1] } : row[1];
    return { name: row[0], src, level: row[3] ?? 1, mute: false, steps, ...(row[4] ? { choke: true } : {}) };
  });
  return p;
}
const T44: TimeSig = { num: 4, den: 4 }, T68: TimeSig = { num: 6, den: 8 };

/** The patterns behind the default pad layout (pads 2 to 16). Kick and cajon tracks choke, so busy figures stay tight. */
export function rigPatterns(): Pattern[] {
  const C = 'Cajon Slaps', A = 'Acoustic Set';
  const bass: [string, string] = ['Cajon Bass', 'cajon-bass'], slap: [string, string] = ['Cajon Slap', 'cajon-slap'];
  const tap: [string, TrackSrc] = ['Cajon Tap', kit(C, '10 Cajon 10.wav')], tone: [string, TrackSrc] = ['Cajon Tone', kit(C, '8 Cajon 8.wav')];
  const kick = (id: string, name: string, steps: string) => build(id, name, T44, 1, [['Kick', 'thick-kick', steps, 1, true]]);
  const bar = '.... .... .... ....';
  return [
    build('rig-tambo-2-4', 'Tambo 2 and 4', T44, 1, [['Tambourine', 'tambourine-head', '.... X... .... X...']]),
    build('rig-tambo-4', 'Tambo on 4', T44, 1, [['Tambourine', 'tambourine-head', '.... .... .... X...']]),
    // three clap takes in rotation, so the backbeat never sounds like one sample on repeat
    build('rig-clap-2-4', 'Claps 2 and 4', T44, 2, [
      ['Clap A', 'clap',                '.... X... .... .... | .... .... .... X...'],
      ['Clap B', kit(A, 'Clap B.wav'),  '.... .... .... X... | .... .... .... ....'],
      ['Clap C', kit(A, 'Clap C.wav'),  '.... .... .... .... | .... X... .... ....'],
    ]),
    build('rig-cajon-1', 'Cajon Basic', T44, 2, [
      [...bass, 'X... .... x.6. .... | X... .... x.6. ....', 1, true],
      [...slap, '.... X... .... X... | .... X... .... X...', 1, true],
      [...tap,  '..2. ..3. .... ..2. | ..2. ..3. .... ..34', 1, true],
      [...tone, bar],
    ]),
    build('rig-cajon-2', 'Cajon Push', T44, 2, [
      [...bass, 'X..6 .... ..x. .... | X..6 .... ..x. ..5.', 1, true],
      [...slap, '.... X... .... X... | .... X... .... X...', 1, true],
      [...tap,  '.2.. ..2. 2... ..3. | .2.. ..2. 2... ....', 1, true],
      [...tone, bar],
    ]),
    build('rig-cajon-3', 'Cajon Rolling', T44, 2, [
      [...bass, 'X... ...5 ..x. .... | X... ...5 ..x. ....', 1, true],
      [...slap, '.... X... .... X... | .... X... .... X..5', 1, true],
      [...tap,  '.232 .232 23.2 .232 | .232 .232 23.2 .23.', 1, true],
      [...tone, bar],
    ]),
    build('rig-cajon-4', 'Cajon Half Time', T44, 2, [
      [...bass, 'X... .... ..5. .... | X... ...5 ..5. ....', 1, true],
      [...slap, '.... .... X... .... | .... .... X... ..4.', 1, true],
      [...tap,  '..2. ..2. .... 2.3. | ..2. .... .... 2.34', 1, true],
      [...tone, bar],
    ]),
    kick('rig-kick-1', 'Kick on 1',         'X... .... .... ....'),
    kick('rig-kick-and', 'Kick 1 and 3',    'X.5. .... X.5. ....'),          // 1 & and 3 &, the off beats weaker
    kick('rig-kick-sync', 'Kick Syncopated', 'X..6 ..6. .56. ..6.'),         // 1, a of 1, & of 2, e and & of 3, & of 4
    kick('rig-kick-four', 'Four on the Floor', 'X... 7... 7... 7...'),
    kick('rig-kick-worship-1', 'Worship Kick A', 'X... ..6. X... ....'),     // 1, & of 2, 3
    kick('rig-kick-worship-2', 'Worship Kick B', 'X... ...5 X.6. ....'),     // 1, a of 2 into 3, & of 3
    kick('rig-kick-build', 'Kick Build',    '8.2. 2.3. 4.5. 6.7.'),          // big downbeat, drop, then climb through the bar
    // one stomp on the downbeat, a different take each bar
    build('rig-stomp-1', 'Stomp on 1', T44, 4, [
      ['Fast Stomp A', kit(A, 'Fast Stomp A.wav'), `X... .... .... .... | ${bar} | ${bar} | ${bar}`],
      ['Fast Stomp B', kit(A, 'Fast Stomp B.wav'), `${bar} | X... .... .... .... | ${bar} | ${bar}`],
      ['Fast Stomp C', kit(A, 'Fast Stomp C.wav'), `${bar} | ${bar} | X... .... .... .... | ${bar}`],
      ['Fast Stomp D', kit(A, 'Fast Stomp D.wav'), `${bar} | ${bar} | ${bar} | X... .... .... ....`],
    ]),
  ];
}
/** Pattern ids for pads 2 to 16 of the default layout, in pad order. */
export const RIG_PAD_PATTERNS = ['rig-tambo-2-4', 'rig-tambo-4', 'rig-clap-2-4', 'rig-cajon-1', 'rig-cajon-2', 'rig-cajon-3', 'rig-cajon-4',
  'rig-kick-1', 'rig-kick-and', 'rig-kick-sync', 'rig-kick-four', 'rig-kick-worship-1', 'rig-kick-worship-2', 'rig-kick-build', 'rig-stomp-1'];

export function starterPatterns(): Pattern[] {
  return [...baseStarters(), ...rigPatterns()];
}
function baseStarters(): Pattern[] {
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
