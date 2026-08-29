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
    expect(late.binWidth).toBe(92);
    expect(late.gap).toBe(400);
    expect(late.driftAmplitude).toBe(105);
    expect(late.driftFrequency).toBeCloseTo(0.64, 10);
    expect(late.obstacleCount).toBe(2);
    expect(late.obstaclesDrift).toBe(true);
    expect(late.maxOffset).toBeCloseTo(0.75, 10);
  });

  it("introduces obstacles from tier 2 and moves them from tier 4", () => {
    expect(params(10).obstacleCount).toBe(0);
    expect(params(11).obstacleCount).toBe(1);
    // a second obstacle waits two whole tiers: unlucky obstacle placement is
    // what sets the FLOOR of the difficulty curve, not its average
    expect(params(16).obstacleCount).toBe(1);
    expect(params(21).obstacleCount).toBe(2);
    expect(params(16).obstaclesDrift).toBe(false);
    expect(params(21).obstaclesDrift).toBe(true);
  });
});

// --------------------------------------------------------------- fixtures

import {
  FULL_POWER_PULL,
  OBSTACLE_HEIGHT,
  PAPER_RADIUS,
  PREVIEW_INTERVAL,
  PREVIEW_TIME,
  SHAFT_WIDTH,
  SUBSTEP,
} from "../src/config.ts";
import { didCapture, isInsideBin } from "../src/capture.ts";
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

  it("never scores the CROSSING rule on a substep that resolved a collision", () => {
    // A shot that clipped the rim has clipped the rim, whatever its next
    // position would have been. Swept across the whole launch space. (A shot
    // that ended up inside the cavity is a different rule --- see below.)
    for (let angle = 20; angle <= 160; angle += 10) {
      for (let power = 0.3; power <= 1.001; power += 0.2) {
        let w = launched(angle, power);
        for (let i = 0; i < 240 * 6; i++) {
          const result = substep(w, SUBSTEP);
          const byCrossing = result.captured && !isInsideBin(result.world.paper, w.target, result.world.t);
          expect(byCrossing && result.contacts.length > 0).toBe(false);
          if (result.captured) break;
          w = result.world;
          if (w.paper.y < -400) break;
        }
      }
    }
  });

  it("counts a paper sitting in the cavity as in", () => {
    const target = bin({ xBase: 200, y: 500, width: 130 });
    // just under the rim, dead centre
    expect(isInsideBin(paper({ x: 200, y: 494 }), target, 0)).toBe(true);
    // above the rim is not in
    expect(isInsideBin(paper({ x: 200, y: 506 }), target, 0)).toBe(false);
    // beside the bin, at cavity height, is not in
    expect(isInsideBin(paper({ x: 100, y: 470 }), target, 0)).toBe(false);
    // below the floor is not in
    expect(isInsideBin(paper({ x: 200, y: 380 }), target, 0)).toBe(false);
  });

  it("never traps a shot inside the bin without scoring it", () => {
    // The bug this rule exists for, reported from play: the paper goes in
    // over the edge and then "drifts around as if it entered the starting
    // bucket". Clipping the rim blocks the crossing for that substep, but the
    // paper is now BELOW the rim plane, so the crossing can never fire again
    // --- it rattles inside a bin that refuses to score it until the rest
    // timeout calls it a miss.
    //
    // A DRIFTING bin is what makes it common: the rim sweeps sideways into
    // the paper rather than waiting to be hit. Measured at 2.6% of every shot
    // that got in, which is why these levels and phases are pinned rather
    // than swept --- a static-bin sweep does not reproduce it at all.
    for (const { level, launcher, target, obstacles } of run(7919, 8)) {
      if (level !== 6 && level !== 8) continue;
      expect(target.amplitude, "this regression needs a drifting bin").toBeGreaterThan(0);
      for (const t0 of [0, 1.07, 1.33]) {
        for (let angle = 20; angle <= 160; angle += 5) {
          for (const power of [0.7, 0.85, 1]) {
            const a = (angle * Math.PI) / 180;
            const v = launchVelocity({
              x: Math.cos(a) * FULL_POWER_PULL * power,
              y: Math.sin(a) * FULL_POWER_PULL * power,
            });
            let w: World = {
              t: t0,
              paper: { x: driftX(launcher, t0), y: launcher.y, vx: v.x, vy: v.y, angle: 0, spin: 0 },
              launcher,
              target,
              obstacles,
              launcherArmed: false,
            };
            for (let i = 0; i < 240 * 8; i++) {
              const result = substep(w, SUBSTEP);
              if (isInsideBin(result.world.paper, target, result.world.t)) {
                expect(
                  result.captured,
                  `trapped: level ${level}, t0 ${t0}, angle ${angle}, power ${power}`,
                ).toBe(true);
              }
              if (result.captured) break;
              w = result.world;
              if (w.paper.y < launcher.y - 500) break;
            }
          }
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

  it("shows a bounded number of dots, however long the shot would fly", () => {
    const most = Math.floor(PREVIEW_TIME / PREVIEW_INTERVAL);
    expect(most).toBe(11);
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

// ------------------------------------------------------- level generation

import { firstLauncher, nextLevel } from "../src/level.ts";
import { binHeight } from "../src/geometry.ts";
import type { Obstacle } from "../src/geometry.ts";
import { seed } from "../src/rng.ts";

/** Walk a whole run's worth of levels, each target becoming the next
 *  launcher, exactly as play does. */
function* run(rngSeed: number, levels: number) {
  let launcher = firstLauncher();
  let rng = seed(rngSeed);
  for (let level = 1; level <= levels; level++) {
    const next = nextLevel(launcher, level, rng);
    yield { level, launcher, ...next };
    launcher = next.target;
    rng = next.rng;
  }
}

describe("level generation", () => {
  it("keeps every bin's whole swing inside the walls", () => {
    for (let s = 1; s <= 40; s++) {
      for (const { level, target } of run(s * 7919, 30)) {
        const leftMost = target.xBase - target.amplitude - target.width / 2;
        const rightMost = target.xBase + target.amplitude + target.width / 2;
        expect(leftMost, `level ${level}, seed ${s}`).toBeGreaterThanOrEqual(-1e-9);
        expect(rightMost, `level ${level}, seed ${s}`).toBeLessThanOrEqual(SHAFT_WIDTH + 1e-9);
      }
    }
  });

  it("keeps every obstacle's whole swing inside the walls", () => {
    for (let s = 1; s <= 40; s++) {
      for (const { obstacles } of run(s * 104729, 40)) {
        for (const o of obstacles) {
          expect(o.xBase - o.amplitude - o.width / 2).toBeGreaterThanOrEqual(-1e-9);
          expect(o.xBase + o.amplitude + o.width / 2).toBeLessThanOrEqual(SHAFT_WIDTH + 1e-9);
        }
      }
    }
  });

  it("never puts an obstacle flush against either bin", () => {
    for (let s = 1; s <= 40; s++) {
      for (const { launcher, target, obstacles } of run(s * 15485863, 40)) {
        for (const o of obstacles) {
          expect(o.y).toBeGreaterThan(launcher.y);
          expect(o.y + OBSTACLE_HEIGHT).toBeLessThan(target.y - binHeight(target));
        }
      }
    }
  });

  it("never seals a height: no obstacle can span the shaft", () => {
    // Obstacles get one horizontal band each, and the widest is 140 of a 420
    // shaft --- so every height always has clear air somewhere across it.
    for (let s = 1; s <= 40; s++) {
      for (const { obstacles } of run(s * 32452843, 40)) {
        const sorted = [...obstacles].sort((a, b) => a.y - b.y);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]!.y).toBeGreaterThan(sorted[i - 1]!.y + OBSTACLE_HEIGHT);
        }
        for (const o of obstacles) expect(o.width).toBeLessThan(SHAFT_WIDTH / 2);
      }
    }
  });

  it("never generates a level too tight for a human to aim at", () => {
    // Solvable is not the same as fair. An earlier draft of the difficulty
    // constants produced levels with a solution --- and an aiming window of a
    // fraction of a degree, which no player will ever find. The floor here is
    // 5 degrees, measured as an unbroken band of scoring angles. A thumb on a
    // phone is good to perhaps 3-5, and `pnpm probe` shows the tuned generator
    // clearing 10 at every tier --- so this floor catches a real regression,
    // not just a zero.
    //
    // One level per tier rather than all of them: the aiming window has to be
    // searched across launch power AND the moment in the drift cycle, and a
    // grid coarse enough to run on every level is coarse enough to miss a
    // window that is really there.
    const sampled = [2, 7, 12, 17, 21];
    for (const { level, launcher, target, obstacles } of run(20260831, 21)) {
      if (!sampled.includes(level)) continue;
      expect(hasAimTolerance(launcher, target, obstacles, 5), `level ${level}`).toBe(true);
    }
  });
});

/** Does some unbroken band of at least `minDegrees` of launch angle score?
 *  Returns as soon as one is found --- this is a floor, not a measurement. */
function hasAimTolerance(
  launcher: Bin,
  target: Bin,
  obstacles: readonly Obstacle[],
  minDegrees: number,
): boolean {
  const step = 0.5;
  // Sample right across the target's own drift cycle: a window that only
  // opens when the bin is at one end of its swing is still a window, and the
  // player can wait for it.
  const period = target.frequency > 0 ? 1 / target.frequency : 1;
  const moments = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * period);
  for (const t0 of moments) {
    for (const power of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      let band = 0;
      for (let angle = 10; angle <= 170; angle += step) {
        if (scoresFrom(launcher, target, obstacles, t0, angle, power)) {
          band += step;
          if (band >= minDegrees) return true;
        } else band = 0;
      }
    }
  }
  return false;
}

function scoresFrom(
  launcher: Bin,
  target: Bin,
  obstacles: readonly Obstacle[],
  t0: number,
  angleDeg: number,
  power: number,
): boolean {
  const a = (angleDeg * Math.PI) / 180;
  const v = launchVelocity({
    x: Math.cos(a) * FULL_POWER_PULL * power,
    y: Math.sin(a) * FULL_POWER_PULL * power,
  });
  let w: World = {
    t: t0,
    paper: { x: driftX(launcher, t0), y: launcher.y, vx: v.x, vy: v.y, angle: 0, spin: 0 },
    launcher,
    target,
    obstacles,
    launcherArmed: false,
  };
  for (let i = 0; i < 240 * 4; i++) {
    const result = substep(w, SUBSTEP);
    if (result.captured) return true;
    w = result.world;
    if (w.paper.y < launcher.y - 500) return false;
  }
  return false;
}
// ------------------------------------------------------------ the rulebook
//
// Lives, combo and when a run ends, asserted with no canvas anywhere.

import { STARTING_LIVES } from "../src/config.ts";
import { initial, reduce } from "../src/game.ts";
import type { GameEvent, GameState } from "../src/game.ts";

const play = (state: GameState, ...events: GameEvent[]): GameState =>
  events.reduce((s, e) => reduce(s, e).state, state);

/** Fly the current shot to whatever it ends in. */
function settle(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 2000 && s.phase === "flight"; i++) s = reduce(s, { type: "tick", dt: 1 / 60 }).state;
  return s;
}

/** Throw the shot away: straight down, which can only ever be a miss. */
function throwAway(state: GameState): GameState {
  const aimed = play(state, { type: "aimStart" }, {
    type: "aimMove",
    pull: { x: 0, y: -200 },
    pullPx: 200,
  });
  return settle(play(aimed, { type: "aimEnd" }));
}

/** Let the camera finish its climb so the next shot can be aimed. */
function land(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 200 && s.phase === "panning"; i++) s = reduce(s, { type: "tick", dt: 1 / 60 }).state;
  return s;
}

describe("lives and the end of a run", () => {
  it("starts with three lives and one level", () => {
    const s = initial(1);
    expect(s.lives).toBe(STARTING_LIVES);
    expect(s.level).toBe(1);
    expect(s.score).toBe(0);
  });

  it("takes one life per miss and keeps playing", () => {
    let s = initial(1);
    for (const expected of [2, 1, 0]) {
      s = throwAway(s);
      expect(s.lives).toBe(expected);
      expect(s.phase).toBe("aiming");
    }
  });

  it("ends on the FOURTH miss, not the third", () => {
    // three lives means four attempts. Getting this off by one either robs
    // the player of a turn or hands them a free one.
    let s = initial(1);
    s = throwAway(s);
    s = throwAway(s);
    s = throwAway(s);
    expect(s.phase).toBe("aiming");
    expect(s.lives).toBe(0);
    s = throwAway(s);
    expect(s.phase).toBe("gameover");
  });

  it("never lowers the score on a miss", () => {
    let s = initial(1);
    const before = s.score;
    s = throwAway(s);
    expect(s.score).toBe(before);
  });

  it("does not let the tap that ended the run restart it", () => {
    let s = initial(1);
    for (let i = 0; i < 4; i++) s = throwAway(s);
    expect(s.phase).toBe("gameover");
    s = play(s, { type: "aimStart" });
    expect(s.phase).toBe("gameover");
    // ...but a moment later, any tap does
    s = play(s, { type: "tick", dt: 1 }, { type: "aimStart" });
    expect(s.phase).toBe("aiming");
    expect(s.lives).toBe(STARTING_LIVES);
    expect(s.score).toBe(0);
  });

  it("remembers the best score across a restart", () => {
    let s = { ...initial(1), score: 42 };
    for (let i = 0; i < 4; i++) s = throwAway(s);
    expect(s.best).toBe(42);
    s = play(s, { type: "tick", dt: 1 }, { type: "aimStart" });
    expect(s.best).toBe(42);
    expect(s.score).toBe(0);
  });
});

describe("scoring a run", () => {
  /** Find a launch that scores from the current state, and take it. */
  function scoreOnce(state: GameState): GameState | null {
    for (let angle = 10; angle <= 170; angle += 0.5) {
      for (const power of [0.6, 0.7, 0.8, 0.9, 1]) {
        const a = (angle * Math.PI) / 180;
        const pull = {
          x: Math.cos(a) * FULL_POWER_PULL * power,
          y: Math.sin(a) * FULL_POWER_PULL * power,
        };
        const attempt = settle(
          play(state, { type: "aimStart" }, { type: "aimMove", pull, pullPx: 200 }, { type: "aimEnd" }),
        );
        if (attempt.level > state.level) return land(attempt);
      }
    }
    return null;
  }

  it("raises the level on a capture and not on a miss", () => {
    const start = initial(7);
    const scored = scoreOnce(start);
    expect(scored, "no launch in the whole sweep scored on level 1").not.toBeNull();
    expect(scored!.level).toBe(2);
    expect(scored!.combo).toBe(1);
    expect(scored!.score).toBe(1);

    const missed = throwAway(scored!);
    expect(missed.level).toBe(2);
    expect(missed.combo).toBe(0);
  });

  it("makes the bin you land in the bin you throw from", () => {
    // the whole idea of the game, asserted: the target's offset from the wall
    // and its motion carry over intact
    const start = initial(7);
    const target = start.sim.world.target;
    const scored = scoreOnce(start);
    expect(scored).not.toBeNull();
    expect(scored!.sim.world.launcher.xBase).toBe(target.xBase);
    expect(scored!.sim.world.launcher.amplitude).toBe(target.amplitude);
    expect(scored!.sim.world.launcher.frequency).toBe(target.frequency);
    expect(scored!.sim.world.launcher.phase).toBe(target.phase);
  });

  it("tracks the longest combo, not the last one", () => {
    let s: GameState | null = initial(7);
    for (let i = 0; i < 3 && s; i++) s = scoreOnce(s);
    expect(s).not.toBeNull();
    expect(s!.combo).toBe(3);
    expect(s!.maxCombo).toBe(3);
    const after = throwAway(s!);
    expect(after.combo).toBe(0);
    expect(after.maxCombo).toBe(3);
  });
});

describe("aiming", () => {
  it("treats a tap below the threshold as no shot at all", () => {
    const s = play(initial(1), { type: "aimStart" }, {
      type: "aimMove",
      pull: { x: 0, y: 5 },
      pullPx: 5,
    }, { type: "aimEnd" });
    expect(s.phase).toBe("aiming");
    expect(s.lives).toBe(STARTING_LIVES);
  });

  it("retires the attract loop the moment a shot is taken", () => {
    const start = initial(1);
    expect(start.phase).toBe("attract");
    expect(start.hasLaunched).toBe(false);
    const after = throwAway(start);
    expect(after.hasLaunched).toBe(true);
    // and it stays retired through a restart --- the lesson is learned once
    let ended = after;
    for (let i = 0; i < 3; i++) ended = throwAway(ended);
    const restarted = play(ended, { type: "tick", dt: 1 }, { type: "aimStart" });
    expect(restarted.hasLaunched).toBe(true);
    expect(restarted.phase).not.toBe("attract");
  });

  it("keeps the bins drifting while you take your time", () => {
    // a bin that froze while you aimed would make waiting for the right
    // moment meaningless, and waiting is half the skill at higher tiers
    const drifting = { ...initial(1) };
    const moving: GameState = {
      ...drifting,
      sim: {
        ...drifting.sim,
        world: {
          ...drifting.sim.world,
          target: { ...drifting.sim.world.target, amplitude: 100, frequency: 0.5 },
        },
      },
    };
    const before = driftX(moving.sim.world.target, moving.sim.world.t);
    const later = play(moving, { type: "aimStart" }, { type: "tick", dt: 0.5 });
    expect(driftX(later.sim.world.target, later.sim.world.t)).not.toBeCloseTo(before, 3);
  });
});

// ------------------------------------------------------- the no-words rule
//
// A sensor, not a contract test. The brief forbids instructions anywhere on
// screen, and prose is the easiest thing in the world to add later "just to
// help" --- so the built page is held to an allowlist of every string it is
// permitted to ship.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

describe("the page teaches itself", () => {
  const doc = new JSDOM(readFileSync("dist/index.html", "utf8")).window.document;

  it("ships no instructional prose", () => {
    // Everything the design allows on screen: the title, the source credit,
    // and the four lines of the end screen. Nothing explains how to play.
    const allowed = ["paper jump", "source", "level:", "score:", "max combo:", "click to restart"];
    let left = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    for (const phrase of allowed) left = left.split(phrase).join("");
    // digits, the score separator and whitespace are the only survivors
    left = left.replace(/[0-9/\s]/g, "");
    expect(left, "unexpected text shipped on the page").toBe("");
  });

  it("keeps the overlay to its three elements plus the landmark", () => {
    expect(doc.querySelector("#lives")).toBeTruthy();
    expect(doc.querySelector("#score")).toBeTruthy();
    expect(doc.querySelector("h1")?.textContent?.trim()).toBe("paper jump");
    expect(doc.querySelector("nav a")).toBeTruthy();
  });

  it("hides the end screen until there is an end to show", () => {
    expect(doc.querySelector("#end")?.hasAttribute("hidden")).toBe(true);
  });
});

// ------------------------------------------------------------ extra lives

import { LIFE_EVERY, MAX_LIVES } from "../src/config.ts";
import { livesAfterCapture } from "../src/game.ts";

describe("earning lives back", () => {
  it("awards one on every fifth level and none in between", () => {
    // levels 6, 11, 16 ... which is exactly where the tier steps up
    for (let level = 2; level <= 40; level++) {
      const awarded = livesAfterCapture(1, level) > 1;
      expect(awarded, `level ${level}`).toBe((level - 1) % LIFE_EVERY === 0);
    }
  });

  it("never goes past the ceiling", () => {
    expect(livesAfterCapture(MAX_LIVES, 6)).toBe(MAX_LIVES);
    expect(livesAfterCapture(MAX_LIVES - 1, 6)).toBe(MAX_LIVES);
    for (let level = 2; level <= 60; level++) {
      expect(livesAfterCapture(MAX_LIVES, level)).toBeLessThanOrEqual(MAX_LIVES);
    }
  });

  it("climbs 3 to 5 over the first fifteen levels and stops", () => {
    let lives = STARTING_LIVES;
    const at: Record<number, number> = {};
    for (let level = 2; level <= 30; level++) {
      lives = livesAfterCapture(lives, level);
      at[level] = lives;
    }
    expect(at[5]).toBe(3);
    expect(at[6]).toBe(4);
    expect(at[11]).toBe(5);
    expect(at[16]).toBe(5);
    expect(at[30]).toBe(5);
  });

  it("has a dot on the overlay for every life it can award", () => {
    // the HUD cannot show a life it has no dot for
    const built = new JSDOM(readFileSync("dist/index.html", "utf8")).window.document;
    expect(built.querySelectorAll("#lives .dot").length).toBe(MAX_LIVES);
  });
});
