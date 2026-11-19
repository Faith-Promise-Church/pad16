// Which layout a window gets. Pure, so it can be tested without a browser.
export type Tier = 'compact' | 'medium' | 'expanded';
export type Arrangement = 'side' | 'stack';
export type TabsPlace = 'bar' | 'bar-icons' | 'bottom';
export type BarRows = 1 | 2 | 3;
/** How the Ambient and Bass channels are drawn: upright faders beside the pads, two wide channels under them,
 *  one channel to a row where it is narrow, or the two sharing one row (on and off and level only) where height is scarce. */
export type StripsShape = 'upright' | 'wide' | 'rows' | 'pair';

/** Room and shape from the window alone, so a resized iPad window, a folding phone and a phone on its side each get a layout that fits.
 *  compact: a phone, or a narrow window. medium: a small tablet, a folding phone opened up, a half-screen window. expanded: an iPad.
 *  side puts the pads beside the controls (landscape); stack puts them above (portrait).
 *  tabs: where the five Edit destinations go: in the top bar when it is wide enough, along the bottom when not, icons only on a phone on its side.
 *  bar: how many rows the Perform bar takes, so every control keeps a full-size target. Three rows also means the bar is narrow enough
 *  to sit beside the pads on a short landscape screen, which gives the pads the full height. */
export function layoutFor(w: number, ht: number): { tier: Tier; arr: Arrangement; tabs: TabsPlace; bar: BarRows; strips: StripsShape } {
  const arr: Arrangement = w / ht >= 1.15 ? 'side' : 'stack';
  const tier: Tier = w < 600 || ht < 500 ? 'compact' : w < 1000 || ht < 700 ? 'medium' : 'expanded';
  const tabs: TabsPlace = w >= 900 ? 'bar' : ht < 500 ? 'bar-icons' : 'bottom';
  const bar: BarRows = tier === 'compact' || (arr === 'side' && ht < 700) ? 3 : w < 1180 ? 2 : 1;
  const strips: StripsShape = arr === 'side' && bar !== 3 ? 'upright'
    : tier === 'compact' && (arr === 'side' || ht < 800) ? 'pair'
    : tier === 'compact' || arr === 'side' ? 'rows' : 'wide';
  return { tier, arr, tabs, bar, strips };
}
/** Columns for the scene buttons: one row on a wide portrait screen, two columns beside the pads, otherwise two balanced rows
 *  (a phone on its side has width to spare and no height, so it gets the two rows as well). */
export function sceneColumns(count: number, tier: Tier, arr: Arrangement): number {
  if (count <= 0) return 1;
  if (arr === 'side') return tier === 'compact' ? (count <= 4 ? count : Math.ceil(count / 2)) : count <= 4 ? 1 : 2;
  if (tier === 'expanded') return count;
  return count <= 4 ? count : Math.ceil(count / 2);
}
