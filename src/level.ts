// Where the next bin goes, and what stands between you and it.
//
// Every draw takes an RNG state and returns the next one, so a whole run
// unfolds deterministically from its seed --- which is what lets the
// reachability test below brute-force hundreds of generated levels and assert
// that none of them is impossible.
import { OBSTACLE_HEIGHT, SHAFT_WIDTH } from "./config.ts";
import { params } from "./difficulty.ts";
import { binHeight } from "./geometry.ts";
import type { Bin, Obstacle } from "./geometry.ts";
import { range, sign } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { clamp } from "./vec.ts";

const OBSTACLE_MIN_WIDTH = 60;
const OBSTACLE_MAX_WIDTH = 120;

/** Clearance kept above the launcher and below the target so an obstacle can
 *  never be flush against either bin. */
const OBSTACLE_MARGIN_BELOW = 60;
const OBSTACLE_MARGIN_ABOVE = 40;

export type Level = {
  readonly target: Bin;
  readonly obstacles: readonly Obstacle[];
  readonly rng: RngState;
};

/** The band of xBase values that keeps a drifter's whole swing inside the
 *  walls. Returns a centred point if the swing is wider than the shaft. */
function baseRange(width: number, amplitude: number): [number, number] {
  const lo = width / 2 + amplitude;
  const hi = SHAFT_WIDTH - width / 2 - amplitude;
  return lo <= hi ? [lo, hi] : [SHAFT_WIDTH / 2, SHAFT_WIDTH / 2];
}

export function nextLevel(launcher: Bin, level: number, rng: RngState): Level {
  const p = params(level);
  let state = rng;

  const [lo, hi] = baseRange(p.binWidth, p.driftAmplitude);

  let magnitude: number;
  let direction: number;
  let phase: number;
  [magnitude, state] = range(state, p.minOffset * SHAFT_WIDTH, p.maxOffset * SHAFT_WIDTH);
  [direction, state] = sign(state);
  [phase, state] = range(state, 0, Math.PI * 2);

  // Prefer the side the draw chose; mirror it if that side has no room, and
  // clamp only as a last resort.
  let xBase = launcher.xBase + direction * magnitude;
  if (xBase < lo || xBase > hi) xBase = launcher.xBase - direction * magnitude;

  const target: Bin = {
    xBase: clamp(xBase, lo, hi),
    y: launcher.y + p.gap,
    width: p.binWidth,
    amplitude: p.driftAmplitude,
    frequency: p.driftFrequency,
    phase,
  };

  const obstacles: Obstacle[] = [];
  if (p.obstacleCount > 0) {
    // One obstacle per horizontal band. Distinct bands are what guarantee no
    // single height is ever sealed: the widest obstacle is 140 of a 420 shaft,
    // so every band always has 280 of clear air somewhere in it.
    const bottom = launcher.y + OBSTACLE_MARGIN_BELOW;
    const top = target.y - binHeight(target) - OBSTACLE_MARGIN_ABOVE - OBSTACLE_HEIGHT;
    const bandHeight = (top - bottom) / p.obstacleCount;

    for (let i = 0; i < p.obstacleCount; i++) {
      let width: number;
      let y: number;
      let oPhase: number;
      [width, state] = range(state, OBSTACLE_MIN_WIDTH, OBSTACLE_MAX_WIDTH);
      // Inset within the band: without this, one obstacle at the top of its
      // band and the next at the bottom of the next band touch, and two bars
      // flush together read as one wall the player can't see through.
      [y, state] = range(
        state,
        bottom + i * bandHeight,
        bottom + (i + 1) * bandHeight - 2 * OBSTACLE_HEIGHT,
      );
      [oPhase, state] = range(state, 0, Math.PI * 2);

      // A drifting launcher shooting at a drifting bin is already two moving
      // frames to hold in your head. Obstacles that swing as hard as the bins
      // make it three, and the aiming window collapses --- so they drift, but
      // barely.
      const amplitude = p.obstaclesDrift ? p.driftAmplitude * 0.3 : 0;
      const [oLo, oHi] = baseRange(width, amplitude);
      let ox: number;
      [ox, state] = range(state, oLo, oHi);

      obstacles.push({
        xBase: ox,
        y,
        width,
        amplitude,
        frequency: p.obstaclesDrift ? p.driftFrequency : 0,
        phase: oPhase,
      });
    }
  }

  return { target, obstacles, rng: state };
}

/** The bin the very first shot comes out of: dead centre, static, tier 0. */
export function firstLauncher(): Bin {
  return {
    xBase: SHAFT_WIDTH / 2,
    y: 0,
    width: params(1).binWidth,
    amplitude: 0,
    frequency: 0,
    phase: 0,
  };
}
