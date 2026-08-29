// The week's contract tests: spec/paper-jump.md turned into assertions.
//
// These test what the game must DO, not how it's built --- they'd survive
// swapping the renderer or the integrator. Everything under test is a pure
// function over plain data, which is why none of this needs a canvas or a DOM.
import { describe, expect, it } from "vitest";
import { params, tier } from "../src/difficulty.ts";
import { points } from "../src/scoring.ts";

describe("scoring: 1 + floor(combo / 5), capped at 5", () => {
  // spec/paper-jump.md §6. Combo counts consecutive captures INCLUDING the
  // one being scored.
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
    [14, 3],
    [15, 4],
    [19, 4],
    [20, 5],
  ])("combo %i scores %i", (combo, expected) => {
    expect(points(combo)).toBe(expected);
  });

  it("caps at 5 however long the combo runs", () => {
    for (const combo of [21, 25, 40, 100, 1000]) {
      expect(points(combo)).toBe(5);
    }
  });

  it("only ever returns whole numbers", () => {
    for (let combo = 1; combo <= 60; combo++) {
      expect(Number.isInteger(points(combo))).toBe(true);
    }
  });
});

describe("difficulty tiers", () => {
  it("changes tier every five levels", () => {
    expect(tier(1)).toBe(0);
    expect(tier(5)).toBe(0);
    expect(tier(6)).toBe(1);
    expect(tier(10)).toBe(1);
    expect(tier(11)).toBe(2);
  });

  it("gives the first five levels a still, generous shaft", () => {
    // Tier 0 has to be learnable with no words at all, so nothing moves and
    // nothing is in the way.
    for (let level = 1; level <= 5; level++) {
      const p = params(level);
      expect(p.driftAmplitude).toBe(0);
      expect(p.driftFrequency).toBe(0);
      expect(p.obstacleCount).toBe(0);
    }
  });

  it("escalates monotonically", () => {
    for (let level = 2; level <= 80; level++) {
      const prev = params(level - 1);
      const cur = params(level);
      expect(cur.binWidth).toBeLessThanOrEqual(prev.binWidth);
      expect(cur.gap).toBeGreaterThanOrEqual(prev.gap);
      expect(cur.driftAmplitude).toBeGreaterThanOrEqual(prev.driftAmplitude);
      expect(cur.obstacleCount).toBeGreaterThanOrEqual(prev.obstacleCount);
    }
  });

  it("asymptotes rather than running away", () => {
    // A player good enough to reach level 200 should meet a hard game, not an
    // impossible one.
    const late = params(200);
    expect(late.binWidth).toBe(78);
    expect(late.gap).toBe(480);
    expect(late.driftAmplitude).toBe(140);
    expect(late.driftFrequency).toBeCloseTo(0.75, 10);
    expect(late.obstacleCount).toBe(3);
    expect(late.obstaclesDrift).toBe(true);
  });

  it("introduces obstacles from tier 2 and moves them from tier 4", () => {
    expect(params(10).obstacleCount).toBe(0);
    expect(params(11).obstacleCount).toBe(1);
    expect(params(16).obstaclesDrift).toBe(false);
    expect(params(21).obstaclesDrift).toBe(true);
  });
});

// --------------------------------------------------------------- fixtures

import {
  FULL_POWER_PULL,
  PAPER_RADIUS,
  PREVIEW_INTERVAL,
  PREVIEW_TIME,
  SHAFT_WIDTH,
  SUBSTEP,
} from "../src/config.ts";
import { didCapture } from "../src/capture.ts";
import { driftX } from "../src/geometry.ts";
import type { Bin, Paper } from "../src/geometry.ts";
import { advance, launchVelocity, simulate, substep } from "../src/physics.ts";
import type { World } from "../src/physics.ts";

const bin = (over: Partial<Bin> = {}): Bin => ({
  xBase: SHAFT_WIDTH / 2,
  y: 300,
  width: 130,
  amplitude: 0,
  frequency: 0,
  phase: 0,
  ...over,
});

const paper = (over: Partial<Paper> = {}): Paper => ({
  x: SHAFT_WIDTH / 2,
  y: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  spin: 0,
  ...over,
});

const world = (over: Partial<World> = {}): World => ({
  t: 0,
  paper: paper(),
  launcher: bin({ y: 100 }),
  target: bin({ y: 500 }),
  obstacles: [],
  launcherArmed: false,
  ...over,
});

/** A world with the shot already away, at `angleDeg` from the +x axis. */
function launched(angleDeg: number, power: number, over: Partial<World> = {}): World {
  const w = world(over);
  const a = (angleDeg * Math.PI) / 180;
  const v = launchVelocity({
    x: Math.cos(a) * FULL_POWER_PULL * power,
    y: Math.sin(a) * FULL_POWER_PULL * power,
  });
  return {
    ...w,
    paper: { ...w.paper, x: driftX(w.launcher, 0), y: w.launcher.y, vx: v.x, vy: v.y },
  };
}

// ------------------------------------------------------------------ capture
//
// THE focused rule test the published spec asks for. Everything else in the
// game is decoration on top of "did the paper go in".

describe("capture", () => {
  // width 130, thickness 6 each side, so the clear span is 118 wide:
  // centred on 200 that's x in [141, 259].
  const target = bin({ xBase: 200, y: 500, width: 130 });
  const falling = (x: number, y: number) => paper({ x, y, vy: -300 });

  it("captures a downward crossing of the rim inside the clear span", () => {
    expect(didCapture(falling(200, 502), falling(200, 498), target, 0)).toBe(true);
  });

  it("captures on the clear span's exact edge", () => {
    expect(didCapture(falling(141, 502), falling(141, 498), target, 0)).toBe(true);
    expect(didCapture(falling(259, 502), falling(259, 498), target, 0)).toBe(true);
  });

  it("does not capture a crossing outside the clear span", () => {
    // this is a shot landing on the rim, not in the bin
    expect(didCapture(falling(138, 502), falling(138, 498), target, 0)).toBe(false);
    expect(didCapture(falling(262, 502), falling(262, 498), target, 0)).toBe(false);
  });

  it("does not capture a paper rising through the rim plane", () => {
    const up = (x: number, y: number) => paper({ x, y, vy: 300 });
    expect(didCapture(up(200, 498), up(200, 502), target, 0)).toBe(false);
  });

  it("does not capture without a crossing at all", () => {
    expect(didCapture(falling(200, 600), falling(200, 560), target, 0)).toBe(false);
    expect(didCapture(falling(200, 400), falling(200, 360), target, 0)).toBe(false);
  });

  it("follows a drifting bin rather than where it started", () => {
    // at t = 0.5 with frequency 0.5, sin(pi/2) = 1, so the bin sits at 300
    const drifting = bin({ xBase: 200, y: 500, width: 130, amplitude: 100, frequency: 0.5 });
    expect(didCapture(falling(300, 502), falling(300, 498), drifting, 0.5)).toBe(true);
    // and where it used to be is now thin air
    expect(didCapture(falling(200, 502), falling(200, 498), drifting, 0.5)).toBe(false);
  });

  it("never captures on a substep that also resolved a collision", () => {
    // A shot that clipped the rim has clipped the rim, whatever its next
    // position would have been. Swept across the whole launch space.
    for (let angle = 20; angle <= 160; angle += 10) {
      for (let power = 0.3; power <= 1.001; power += 0.2) {
        let w = launched(angle, power);
        for (let i = 0; i < 240 * 6; i++) {
          const result = substep(w, SUBSTEP);
          expect(result.captured && result.contacts.length > 0).toBe(false);
          if (result.captured) break;
          w = result.world;
          if (w.paper.y < -400) break;
        }
      }
    }
  });
});

// ------------------------------------------------------------- determinism

describe("physics determinism", () => {
  const runSubsteps = (n: number): Paper => {
    let w = launched(65, 0.8);
    for (let i = 0; i < n; i++) w = substep(w, SUBSTEP).world;
    return w.paper;
  };

  it("replays a launch bit-identically", () => {
    expect(runSubsteps(900)).toEqual(runSubsteps(900));
  });

  it("plays out identically at 33, 67 and 100 fps", () => {
    // 1.71s of flight, reached three ways. The frame rate decides how often
    // the simulation is asked, never how far the paper travels.
    const at = (dt: number, frames: number): Paper => {
      let sim = { world: launched(65, 0.8), accumulator: 0 };
      for (let i = 0; i < frames; i++) sim = advance(sim, dt).sim;
      return sim.world.paper;
    };
    const slow = at(0.03, 57);
    const mid = at(0.015, 114);
    const fast = at(0.01, 171);
    expect(mid).toEqual(slow);
    expect(fast).toEqual(slow);
  });

  it("refuses to fast-forward a long frame", () => {
    // a backgrounded tab returning must not teleport the paper
    const capped = advance({ world: launched(65, 0.8), accumulator: 0 }, 30);
    const quarter = advance({ world: launched(65, 0.8), accumulator: 0 }, 0.25);
    expect(capped.sim.world.paper).toEqual(quarter.sim.world.paper);
  });
});

// ----------------------------------------------------------- the preview

describe("trajectory preview", () => {
  it("never draws a dot past a wall", () => {
    // The preview's whole job is to teach the gesture without solving the
    // bounce, so it must stop dead at the first wall.
    for (let angle = 5; angle <= 175; angle += 5) {
      for (const power of [0.4, 0.7, 1]) {
        for (const point of simulate(launched(angle, power), PREVIEW_TIME, PREVIEW_INTERVAL)) {
          expect(point.x).toBeGreaterThanOrEqual(PAPER_RADIUS - 1e-9);
          expect(point.x).toBeLessThanOrEqual(SHAFT_WIDTH - PAPER_RADIUS + 1e-9);
        }
      }
    }
  });

  it("shows at most six dots, however long the shot would fly", () => {
    const most = Math.floor(PREVIEW_TIME / PREVIEW_INTERVAL);
    expect(most).toBe(6);
    for (let angle = 5; angle <= 175; angle += 5) {
      expect(simulate(launched(angle, 1), PREVIEW_TIME, PREVIEW_INTERVAL).length).toBeLessThanOrEqual(
        most,
      );
    }
  });

  it("predicts the same path the shot actually takes", () => {
    // the preview runs the live integrator, not a closed-form arc: if these
    // ever disagree, the dots are lying to the player
    const start = launched(70, 0.9);
    const preview = simulate(start, PREVIEW_INTERVAL, PREVIEW_INTERVAL);
    let w = start;
    // simulate() samples on the first substep at or past the interval, so the
    // comparison has to land on the same one
    for (let i = 0; i < Math.ceil(PREVIEW_INTERVAL / SUBSTEP); i++) w = substep(w, SUBSTEP).world;
    expect(preview[0]?.x).toBeCloseTo(w.paper.x, 10);
    expect(preview[0]?.y).toBeCloseTo(w.paper.y, 10);
  });
});

// --------------------------------------------------------------- the sling

describe("the slingshot", () => {
  it("saturates at full power so a huge drag cannot cheat", () => {
    const atFull = launchVelocity({ x: 0, y: FULL_POWER_PULL });
    const atDouble = launchVelocity({ x: 0, y: FULL_POWER_PULL * 2 });
    expect(atDouble).toEqual(atFull);
  });

  it("scales linearly below full power", () => {
    const half = launchVelocity({ x: 0, y: FULL_POWER_PULL / 2 });
    const full = launchVelocity({ x: 0, y: FULL_POWER_PULL });
    expect(half.y).toBeCloseTo(full.y / 2, 10);
  });

  it("treats a zero pull as no shot rather than a NaN", () => {
    expect(launchVelocity({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
