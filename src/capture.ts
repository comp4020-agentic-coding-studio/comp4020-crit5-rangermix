import { binInnerWidth, driftX } from "./geometry.ts";
import type { Bin, Paper } from "./geometry.ts";

/**
 * Did the paper just go in?
 *
 * A capture is a downward crossing of the rim plane, inside the clear span
 * between the bin's inner faces. All three conditions are required, and the
 * caller must not ask if a collision was already resolved in the same substep
 * --- a shot that clipped the rim has clipped the rim, whatever its next
 * position would have been. spec/paper-jump.md §6.
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
