import { BIN_THICKNESS } from "./config.ts";
import { binHeight, binInnerWidth, driftX } from "./geometry.ts";
import type { Bin, Paper } from "./geometry.ts";

/**
 * Did the paper just go in, cleanly?
 *
 * A clean capture is a downward crossing of the rim plane, inside the clear
 * span between the bin's inner faces. All three conditions are required, and
 * the caller must not ask if a collision was already resolved in the same
 * substep --- a shot that clipped the rim has clipped the rim, whatever its
 * next position would have been. spec/paper-jump.md §6.
 *
 * The test is on the paper's CENTRE, not its edge, which is deliberately
 * generous: a shot that visually kisses the rim on the way in still counts.
 */
export function didCapture(prev: Paper, cur: Paper, bin: Bin, t: number): boolean {
  // 1. crossing the rim plane, downward
  if (!(prev.y > bin.y && cur.y <= bin.y)) return false;
  // 2. actually falling, not rising through it from below
  if (cur.vy >= 0) return false;
  // 3. inside the clear span
  const half = binInnerWidth(bin) / 2;
  const cx = driftX(bin, t);
  return cur.x >= cx - half && cur.x <= cx + half;
}

/**
 * Is the paper sitting in the cavity?
 *
 * This exists because the rule above, alone, could trap a shot forever. Clip
 * the rim on the way in and the crossing is blocked for that substep --- but
 * the paper is now BELOW the rim plane, so `prev.y > bin.y` can never be true
 * again and it rattles around inside a bin that refuses to score it, until
 * the rest timeout calls it a miss.
 *
 * The physical truth settles it: if it clipped the rim and ended up inside
 * anyway, it went in. Real bins work like that. So containment captures on
 * any substep, collision or not, and the crossing rule keeps its contract.
 */
export function isInsideBin(paper: Paper, bin: Bin, t: number): boolean {
  if (paper.y > bin.y) return false;
  if (paper.y < bin.y - binHeight(bin) + BIN_THICKNESS) return false;
  const half = binInnerWidth(bin) / 2;
  const cx = driftX(bin, t);
  return paper.x >= cx - half && paper.x <= cx + half;
}
