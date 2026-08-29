// Where the next bin goes, and what stands between you and it.
//
// Every draw takes an RNG state and returns the next one, so a whole run
// unfolds deterministically from its seed --- which is what lets the
// reachability test below brute-force hundreds of generated levels and assert
// that none of them is impossible.
import { ABOVE_TARGET_CLEARANCE, PAPER_RADIUS, SHAFT_WIDTH } from "./config.ts";
import { params, tier } from "./difficulty.ts";
import { binHeight, obstacleTop } from "./geometry.ts";
import type { Bin, Obstacle, ObstacleShape } from "./geometry.ts";
import { int, range, sign } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { clamp } from "./vec.ts";

/** Clearance kept above the launcher and below the target so an obstacle can
 *  never be flush against either bin. */
const OBSTACLE_MARGIN_BELOW = 60;
const OBSTACLE_MARGIN_ABOVE = 40;
/** Vertical air between two obstacles, so a pair never reads as one wall. */
const OBSTACLE_SEPARATION = 16;

export type Level = {
  readonly target: Bin;
  readonly obstacles: readonly Obstacle[];
  readonly rng: RngState;
};

type ShapeSpec = {
  readonly shape: ObstacleShape;
  readonly width: readonly [number, number];
  readonly height: readonly [number, number];
};

/** Four silhouettes, and they do not bounce alike: a bar deflects by which
 *  face you hit, a disc by where on it you hit, a post is a thin thing to
 *  thread past rather than clear. */
const SHAPES: readonly ShapeSpec[] = [
  { shape: "bar", width: [70, 100], height: [14, 14] },
  { shape: "post", width: [16, 24], height: [46, 84] },
  { shape: "block", width: [34, 52], height: [34, 52] },
  { shape: "disc", width: [34, 56], height: [0, 0] },
];

const BAR = SHAPES[0]!;

/** The band of xBase values that keeps a drifter's whole swing inside the
 *  walls. Returns a centred point if the swing is wider than the shaft. */
function baseRange(width: number, amplitude: number): [number, number] {
  const lo = width / 2 + amplitude;
  const hi = SHAFT_WIDTH - width / 2 - amplitude;
  return lo <= hi ? [lo, hi] : [SHAFT_WIDTH / 2, SHAFT_WIDTH / 2];
}

/** Pick a shape that fits the vertical room available, falling back to a bar
 *  --- the flattest thing there is --- when nothing else does. */
function pickShape(state: RngState, room: number): [ShapeSpec, RngState] {
  const [i, next] = int(state, SHAPES.length);
  const spec = SHAPES[i] ?? BAR;
  return [spec.height[1] <= room ? spec : BAR, next];
}

/** Given a chosen width and amplitude, where along the shaft may it sit? */
type Span = readonly [number, number];
type XRange = (width: number, amplitude: number) => readonly Span[] | null;

function makeObstacle(
  state: RngState,
  spec: ShapeSpec,
  bandBottom: number,
  bandTop: number,
  amplitude: number,
  frequency: number,
  xRange?: XRange,
): [Obstacle | null, RngState] {
  let s = state;
  let width: number;
  [width, s] = range(s, spec.width[0], spec.width[1]);
  // a disc is as tall as it is wide, by definition
  let height: number;
  if (spec.shape === "disc") height = width;
  else [height, s] = range(s, spec.height[0], spec.height[1]);

  const highest = bandTop - height;
  if (highest < bandBottom) return [null, s];

  let y: number;
  let phase: number;
  let xBase: number;
  [y, s] = range(s, bandBottom, highest);
  [phase, s] = range(s, 0, Math.PI * 2);

  // Sample INSIDE whatever room there is, rather than sampling the whole
  // shaft and throwing the result away when it collides with a constraint.
  // Rejection made above-target hazards a 14% curiosity; this makes them a
  // feature of the tier.
  const spans = xRange ? xRange(width, amplitude) : [baseRange(width, amplitude)];
  if (!spans || spans.length === 0) return [null, s];
  let which: number;
  [which, s] = int(s, spans.length);
  const [lo, hi] = spans[which] ?? spans[0]!;
  [xBase, s] = range(s, lo, hi);

  return [{ xBase, y, width, height, shape: spec.shape, amplitude, frequency, phase }, s];
}

export function nextLevel(
  launcher: Bin,
  level: number,
  rng: RngState,
  carried: readonly Obstacle[] = [],
): Level {
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

  // An obstacle placed above the previous target is above THIS launcher, so it
  // survives the climb rather than popping out of existence during the pan ---
  // which is the whole point of showing it early.
  const ceiling = target.y - binHeight(target) - OBSTACLE_MARGIN_ABOVE;
  const kept = carried.filter(
    (o) => o.y > launcher.y + OBSTACLE_MARGIN_BELOW && obstacleTop(o) < ceiling,
  );

  const obstacles: Obstacle[] = [...kept];
  const wanted = Math.max(0, p.obstacleCount - kept.length);

  if (wanted > 0) {
    const floor = kept.reduce(
      (highest, o) => Math.max(highest, obstacleTop(o) + OBSTACLE_SEPARATION),
      launcher.y + OBSTACLE_MARGIN_BELOW,
    );
    const bandHeight = (ceiling - floor) / wanted;
    const amplitude = p.obstaclesDrift ? p.driftAmplitude * 0.3 : 0;
    for (let i = 0; i < wanted; i++) {
      const bottom = floor + i * bandHeight;
      const top = bottom + bandHeight - OBSTACLE_SEPARATION;
      let spec: ShapeSpec;
      [spec, state] = pickShape(state, top - bottom);
      let made: Obstacle | null;
      [made, state] = makeObstacle(
        state,
        spec,
        bottom,
        top,
        amplitude,
        p.obstaclesDrift ? p.driftFrequency : 0,
      );
      if (made) obstacles.push(made);
    }
  }

  // From tier 3, one hazard ABOVE the target: it punishes an overshoot now,
  // and it is the next level's problem after you land. It is skipped rather
  // than forced when there is no room to keep it clear of the bin's mouth,
  // because an obstacle capping the target is not difficulty, it is a wall.
  if (tier(level) >= 3) {
    const bottom = target.y + ABOVE_TARGET_CLEARANCE;
    const top = target.y + p.gap * 0.55;
    let spec: ShapeSpec;
    [spec, state] = pickShape(state, top - bottom);
    let made: Obstacle | null;
    [made, state] = makeObstacle(state, spec, bottom, top, 0, 0, (width, amplitude) => {
      const needed =
        target.width / 2 + target.amplitude + width / 2 + amplitude + PAPER_RADIUS * 2;
      const [lo, hi] = baseRange(width, amplitude);
      const spans: Span[] = [
        [lo, target.xBase - needed],
        [target.xBase + needed, hi],
      ];
      return spans.filter(([a, b]) => b > a);
    });
    if (made) obstacles.push(made);
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
