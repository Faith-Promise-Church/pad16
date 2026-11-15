// Sub synth note priority: monophonic, lowest key wins, sustain pedal holds. Pure state machine.
export type SubAction = { type: 'attack' | 'legato'; note: number } | { type: 'release' } | null;

export class SubNotes {
  lo = 21; hi = 47; pedalEnabled = true;
  held: number[] = [];
  sounding: number | null = null;
  /** True when the sounding note is held by the pedal alone, with no key down. */
  sustained = false;
  pedalDown = false;

  inRange(n: number) { return n >= this.lo && n <= this.hi; }
  private lowest() { return Math.min(...this.held); }

  noteOn(n: number): SubAction {
    if (!this.inRange(n)) return null;
    if (!this.held.includes(n)) this.held.push(n);
    if (this.sounding === null || this.sustained) {
      this.sounding = this.sustained ? n : this.lowest();
      this.sustained = false;
      return { type: 'attack', note: this.sounding };
    }
    const low = this.lowest();
    if (low !== this.sounding) { this.sounding = low; return { type: 'legato', note: low }; }
    return null;
  }
  noteOff(n: number): SubAction {
    const i = this.held.indexOf(n);
    if (i < 0) return null;
    this.held.splice(i, 1);
    if (n !== this.sounding) return null;
    if (this.held.length) { this.sounding = this.lowest(); return { type: 'legato', note: this.sounding }; }
    if (this.pedalDown && this.pedalEnabled) { this.sustained = true; return null; }
    this.sounding = null;
    return { type: 'release' };
  }
  pedal(down: boolean): SubAction {
    this.pedalDown = down;
    if (!down && this.sustained) { this.sustained = false; this.sounding = null; return { type: 'release' }; }
    return null;
  }
  /** Drop everything, for Panic or a lost MIDI link. */
  allOff(): SubAction {
    const was = this.sounding !== null;
    this.held = []; this.sounding = null; this.sustained = false; this.pedalDown = false;
    return was ? { type: 'release' } : null;
  }
  /** Range changed: drop keys that fell outside it. */
  setRange(lo: number, hi: number): SubAction {
    this.lo = Math.min(lo, hi); this.hi = Math.max(lo, hi);
    if (this.sounding !== null && !this.inRange(this.sounding)) return this.allOff();
    this.held = this.held.filter(k => this.inRange(k));
    return null;
  }
}
