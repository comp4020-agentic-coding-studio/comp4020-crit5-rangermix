// The shapes the game is made of, and where they are at a given moment.
//
// Bins and obstacles drift as a pure function of the world clock, so their
// position is never stored --- it's derived. That's what lets the trajectory
// preview run the clock forward and predict a moving target honestly.
import { BIN_HEIGHT_RATIO, BIN_THICKNESS, OBSTACLE_HEIGHT } from "./config.ts";

/** An axis-aligned box. Half-open in neither direction; edges are solid. */
export type Aabb = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

export type Paper = {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** Cosmetic only. Never feeds back into the simulation. */
  readonly angle: number;
  readonly spin: number;
};

/** A mesh bin. `y` is the rim: the bin hangs downward from it. */
export type Bin = {
  readonly xBase: number;
  readonly y: number;
  readonly width: number;
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
};

export type Obstacle = {
  readonly xBase: number;
  readonly y: number;
  readonly width: number;
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
};

type Drifter = {
  readonly xBase: number;
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
};

/** Centre x at time t. */
export function driftX(d: Drifter, t: number): number {
  if (d.amplitude === 0) return d.xBase;
  return d.xBase + d.amplitude * Math.sin(2 * Math.PI * d.frequency * t + d.phase);
}

/** Horizontal velocity at time t --- the derivative of driftX. Collisions
 *  resolve in the collider's frame, so they need this. */
export function driftVx(d: Drifter, t: number): number {
  if (d.amplitude === 0) return 0;
  const w = 2 * Math.PI * d.frequency;
  return d.amplitude * w * Math.cos(w * t + d.phase);
}

export const binHeight = (bin: Bin): number => bin.width * BIN_HEIGHT_RATIO;

/** The clear span between the inner faces --- the capture zone's width. */
export const binInnerWidth = (bin: Bin): number => bin.width - 2 * BIN_THICKNESS;

/** The three solid parts of a bin at time t: left bar, right bar, floor.
 *  The cavity between them is not a collider; it's the capture zone. */
export function binBars(bin: Bin, t: number): [Aabb, Aabb, Aabb] {
  const cx = driftX(bin, t);
  const half = bin.width / 2;
  const h = binHeight(bin);
  const bottom = bin.y - h;
  return [
    { minX: cx - half, minY: bottom, maxX: cx - half + BIN_THICKNESS, maxY: bin.y },
    { minX: cx + half - BIN_THICKNESS, minY: bottom, maxX: cx + half, maxY: bin.y },
    { minX: cx - half, minY: bottom, maxX: cx + half, maxY: bottom + BIN_THICKNESS },
  ];
}

export function obstacleBox(o: Obstacle, t: number): Aabb {
  const cx = driftX(o, t);
  const half = o.width / 2;
  return { minX: cx - half, minY: o.y, maxX: cx + half, maxY: o.y + OBSTACLE_HEIGHT };
}
