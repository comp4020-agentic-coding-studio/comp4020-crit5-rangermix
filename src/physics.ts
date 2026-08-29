// Deterministic, fixed-timestep, hand-rolled.
//
// Hand-rolled rather than a library for one reason: the trajectory preview has
// to run the EXACT same code path as live flight, or the dots lie. That, plus
// a fixed substep with a carried accumulator, is what makes the whole
// simulation reproducible from a seed and testable without a canvas.
import {
  BIN_FRICTION,
  BIN_RESTITUTION,
  DAMPING,
  FULL_POWER_PULL,
  GRAVITY,
  MAX_FRAME,
  MAX_LAUNCH_SPEED,
  OBSTACLE_FRICTION,
  OBSTACLE_RESTITUTION,
  PAPER_RADIUS,
  SHAFT_WIDTH,
  SPIN_RETENTION,
  SUBSTEP,
  WALL_FRICTION,
  WALL_RESTITUTION,
} from "./config.ts";
import { didCapture, isInsideBin } from "./capture.ts";
import { binBars, driftVx, obstacleBox, obstacleDisc } from "./geometry.ts";
import type { Aabb, Bin, Obstacle, Paper } from "./geometry.ts";
import { clamp, len } from "./vec.ts";
import type { Vec } from "./vec.ts";

export type Contact = {
  readonly kind: "wall" | "bin" | "obstacle";
  /** Closing speed along the normal, for the sound and nothing else. */
  readonly speed: number;
};

export type World = {
  readonly t: number;
  readonly paper: Paper;
  readonly launcher: Bin;
  readonly target: Bin;
  readonly obstacles: readonly Obstacle[];
  /** False until the shot has cleared the launcher's rim. A shallow shot must
   *  not be killed by the bin it came out of. */
  readonly launcherArmed: boolean;
};

export type StepResult = {
  readonly world: World;
  readonly contacts: readonly Contact[];
  readonly captured: boolean;
};

/** Mutable scratch for one substep. Allocating four objects per collider at
 *  240 Hz is the one place where purity isn't worth the garbage. */
type Scratch = { x: number; y: number; vx: number; vy: number };

/**
 * Reflect off a surface with the given outward normal.
 *
 * Resolved in the COLLIDER's frame (`vRel = v - vCollider`), without which a
 * tier-5 bin sweeping at ~660 u/s slides straight through the paper instead of
 * batting it. Splitting the relative velocity into normal and tangential parts
 * is what lets friction exist at all: restitution decides how much of the
 * bounce comes back, friction decides how much of the slide survives. A ball
 * that drops into a bin with no tangential friction skids for seconds.
 *
 * Returns the impact speed, or null if the surfaces were already separating.
 */
function bounce(
  m: Scratch,
  nx: number,
  ny: number,
  colliderVx: number,
  restitution: number,
  friction: number,
): number | null {
  const relX = m.vx - colliderVx;
  const relY = m.vy;
  const closing = relX * nx + relY * ny;
  if (closing >= 0) return null; // already separating; the push-out was enough

  const tangentX = relX - closing * nx;
  const tangentY = relY - closing * ny;
  const rebound = -closing * restitution;

  m.vx = tangentX * friction + rebound * nx + colliderVx;
  m.vy = tangentY * friction + rebound * ny;
  return -closing;
}

/**
 * Circle against an axis-aligned box, by the closest-point method.
 *
 * The closest point on a box to an outside circle lies on a face for a face
 * hit and on a corner for a corner hit, so the normal it produces is already
 * corner-anchored --- which is exactly the rounded rim response the game
 * wants, with no separate rim-cap primitives.
 */
function resolveBox(
  m: Scratch,
  box: Aabb,
  boxVx: number,
  restitution: number,
  friction: number,
): number | null {
  const px = clamp(m.x, box.minX, box.maxX);
  const py = clamp(m.y, box.minY, box.maxY);
  let nx = m.x - px;
  let ny = m.y - py;
  const d = Math.hypot(nx, ny);

  if (d > PAPER_RADIUS) return null;

  if (d === 0) {
    // The centre is strictly inside the box, so there is no closest-point
    // normal to use. Escape through the shallowest face.
    const toLeft = m.x - box.minX;
    const toRight = box.maxX - m.x;
    const toBottom = m.y - box.minY;
    const toTop = box.maxY - m.y;
    const shallowest = Math.min(toLeft, toRight, toBottom, toTop);
    if (shallowest === toLeft) {
      nx = -1;
      ny = 0;
      m.x = box.minX - PAPER_RADIUS;
    } else if (shallowest === toRight) {
      nx = 1;
      ny = 0;
      m.x = box.maxX + PAPER_RADIUS;
    } else if (shallowest === toBottom) {
      nx = 0;
      ny = -1;
      m.y = box.minY - PAPER_RADIUS;
    } else {
      nx = 0;
      ny = 1;
      m.y = box.maxY + PAPER_RADIUS;
    }
  } else {
    nx /= d;
    ny /= d;
    m.x = px + nx * PAPER_RADIUS;
    m.y = py + ny * PAPER_RADIUS;
  }

  return bounce(m, nx, ny, boxVx, restitution, friction);
}

/** Circle against circle. A disc deflects by where you hit it rather than by
 *  which face you hit, which is the whole reason it is in the game. */
function resolveDisc(
  m: Scratch,
  cx: number,
  cy: number,
  radius: number,
  discVx: number,
  restitution: number,
  friction: number,
): number | null {
  let nx = m.x - cx;
  let ny = m.y - cy;
  const d = Math.hypot(nx, ny);
  const touching = radius + PAPER_RADIUS;
  if (d > touching) return null;

  if (d === 0) {
    nx = 0;
    ny = 1;
  } else {
    nx /= d;
    ny /= d;
  }
  m.x = cx + nx * touching;
  m.y = cy + ny * touching;

  return bounce(m, nx, ny, discVx, restitution, friction);
}

function resolveWalls(m: Scratch): number | null {
  if (m.x - PAPER_RADIUS < 0) {
    m.x = PAPER_RADIUS;
    return bounce(m, 1, 0, 0, WALL_RESTITUTION, WALL_FRICTION);
  }
  if (m.x + PAPER_RADIUS > SHAFT_WIDTH) {
    m.x = SHAFT_WIDTH - PAPER_RADIUS;
    return bounce(m, -1, 0, 0, WALL_RESTITUTION, WALL_FRICTION);
  }
  return null;
}

/** One fixed substep. The whole simulation is this function repeated. */
export function substep(world: World, dt: number): StepResult {
  const prev = world.paper;
  const t = world.t + dt;

  const m: Scratch = { x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy };

  // semi-implicit Euler: velocity first, then position with the new velocity
  m.vy -= GRAVITY * dt;
  const damp = 1 - DAMPING * dt;
  m.vx *= damp;
  m.vy *= damp;
  m.x += m.vx * dt;
  m.y += m.vy * dt;

  const contacts: Contact[] = [];
  const push = (kind: Contact["kind"], speed: number | null): void => {
    if (speed !== null) contacts.push({ kind, speed });
  };

  push("wall", resolveWalls(m));

  if (world.launcherArmed) {
    const vx = driftVx(world.launcher, t);
    for (const bar of binBars(world.launcher, t)) {
      push("bin", resolveBox(m, bar, vx, BIN_RESTITUTION, BIN_FRICTION));
    }
  }

  for (const o of world.obstacles) {
    const vx = driftVx(o, t);
    if (o.shape === "disc") {
      const disc = obstacleDisc(o, t);
      push(
        "obstacle",
        resolveDisc(m, disc.x, disc.y, disc.r, vx, OBSTACLE_RESTITUTION, OBSTACLE_FRICTION),
      );
    } else {
      push(
        "obstacle",
        resolveBox(m, obstacleBox(o, t), vx, OBSTACLE_RESTITUTION, OBSTACLE_FRICTION),
      );
    }
  }

  const targetVx = driftVx(world.target, t);
  for (const bar of binBars(world.target, t)) {
    push("bin", resolveBox(m, bar, targetVx, BIN_RESTITUTION, BIN_FRICTION));
  }

  const bounced = contacts.length > 0;
  const paper: Paper = {
    x: m.x,
    y: m.y,
    vx: m.vx,
    vy: m.vy,
    angle: prev.angle + prev.spin * dt,
    spin: bounced ? -prev.spin * SPIN_RETENTION : prev.spin,
  };

  // Capture is tested LAST. The crossing rule only counts on a clean substep
  // --- a shot that clipped the rim has clipped the rim --- but a paper that
  // has ended up in the cavity is in, however it got there.
  const captured =
    (!bounced && didCapture(prev, paper, world.target, t)) ||
    isInsideBin(paper, world.target, t);

  const launcherArmed = world.launcherArmed || paper.y > world.launcher.y + PAPER_RADIUS;

  return { world: { ...world, t, paper, launcherArmed }, contacts, captured };
}

export type Sim = { readonly world: World; readonly accumulator: number };

/**
 * Drain a frame's worth of time in fixed substeps, carrying the remainder.
 *
 * This is what makes the game play identically at 30, 60 and 144 fps: the
 * frame rate decides how often we're asked, never how far the paper goes.
 */
export function advance(
  sim: Sim,
  dt: number,
): { sim: Sim; contacts: Contact[]; captured: boolean } {
  let world = sim.world;
  let accumulator = sim.accumulator + Math.min(dt, MAX_FRAME);
  const contacts: Contact[] = [];
  let captured = false;

  while (accumulator >= SUBSTEP) {
    accumulator -= SUBSTEP;
    const result = substep(world, SUBSTEP);
    world = result.world;
    contacts.push(...result.contacts);
    if (result.captured) {
      captured = true;
      break;
    }
  }

  return { sim: { world, accumulator }, contacts, captured };
}

/**
 * The trajectory preview: the same integrator, run forward from a hypothetical
 * launch and cut off at the first thing it touches.
 *
 * It deliberately shows no bounces. Aiming is given to the player; predicting
 * what happens after the first wall is the entire skill curve.
 */
export function simulate(world: World, maxTime: number, interval: number): Vec[] {
  const points: Vec[] = [];
  let w = world;
  let elapsed = 0;
  let nextSample = interval;

  while (elapsed < maxTime - 1e-9) {
    const result = substep(w, SUBSTEP);
    if (result.contacts.length > 0 || result.captured) break;
    w = result.world;
    elapsed += SUBSTEP;
    if (elapsed + 1e-9 >= nextSample) {
      points.push({ x: w.paper.x, y: w.paper.y });
      nextSample += interval;
    }
  }

  return points;
}

/** Pull vector (in world units) to launch velocity. Drag back to fling
 *  forward; power saturates at FULL_POWER_PULL so a huge drag can't cheat. */
export function launchVelocity(pull: Vec): Vec {
  const distance = len(pull);
  if (distance === 0) return { x: 0, y: 0 };
  const speed = MAX_LAUNCH_SPEED * Math.min(1, distance / FULL_POWER_PULL);
  return { x: (pull.x / distance) * speed, y: (pull.y / distance) * speed };
}
