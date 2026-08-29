#!/usr/bin/env node
// Aim-tolerance probe: how hard is each tier, in a unit a person has?
//
// Density over a uniform launch grid is the obvious metric and it is wrong ---
// it punishes a bin sitting almost overhead, which is the easiest shot a human
// can take, because only near-vertical angles reach it. So this measures the
// widest UNBROKEN BAND of launch angles that still scores, sweeping launch
// power and the moment in the drift cycle and keeping the best. Degrees
// compare directly against how precisely a thumb can aim: about 3-5.
//
//   pnpm probe              # the default sample, one level per tier
//   pnpm probe 3 8 12 20    # specific levels
//
// The floor this establishes is asserted in spec/paper-jump.test.ts. Re-run
// this after touching anything in src/difficulty.ts or src/level.ts.
import { FULL_POWER_PULL, SUBSTEP } from "../src/config.ts";
import { params } from "../src/difficulty.ts";
import { driftX } from "../src/geometry.ts";
import type { Bin, Obstacle } from "../src/geometry.ts";
import { firstLauncher, nextLevel } from "../src/level.ts";
import { launchVelocity, substep } from "../src/physics.ts";
import type { World } from "../src/physics.ts";
import { seed } from "../src/rng.ts";

const SEEDS = [20260831, 4242, 99991];
const DEFAULT_LEVELS = [2, 7, 12, 17, 22, 27];
const ANGLE_STEP = 1;
const POWERS = [0.5, 0.58, 0.67, 0.75, 0.83, 0.92, 1];
const PHASES = 8;

function scores(
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

/** Widest unbroken band of scoring angles, in degrees. */
function tolerance(
  launcher: Bin,
  target: Bin,
  obstacles: readonly Obstacle[],
  frequency: number,
): number {
  const period = frequency > 0 ? 1 / frequency : 1;
  let best = 0;
  for (let p = 0; p < PHASES; p++) {
    const t0 = (p / PHASES) * period;
    for (const power of POWERS) {
      let band = 0;
      for (let angle = 10; angle <= 170; angle += ANGLE_STEP) {
        if (scores(launcher, target, obstacles, t0, angle, power)) {
          band += ANGLE_STEP;
          if (band > best) best = band;
        } else band = 0;
      }
    }
  }
  return best;
}

function at(level: number, rngSeed: number): number {
  let launcher = firstLauncher();
  let rng = seed(rngSeed);
  for (let i = 1; i <= level; i++) {
    const next = nextLevel(launcher, i, rng);
    if (i === level) return tolerance(launcher, next.target, next.obstacles, params(i).driftFrequency);
    launcher = next.target;
    rng = next.rng;
  }
  return 0;
}

const levels = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const wanted = levels.length > 0 ? levels : DEFAULT_LEVELS;

console.log("aim tolerance: widest unbroken band of launch angles that still scores");
console.log("a thumb on a phone aims to about 3-5 degrees\n");
console.log("lvl tier   gap  binW  drift  obst   worst   per seed");

const all: number[] = [];
for (const level of wanted) {
  const p = params(level);
  const each = SEEDS.map((s) => at(level, s));
  const worst = Math.min(...each);
  all.push(worst);
  console.log(
    `${String(level).padStart(3)}  ${String(Math.floor((level - 1) / 5)).padStart(3)}` +
      ` ${String(p.gap).padStart(5)} ${String(p.binWidth).padStart(5)}` +
      ` ${String(p.driftAmplitude).padStart(6)} ${String(p.obstacleCount).padStart(5)}` +
      `   ${String(worst).padStart(3)}°   ${each.map((n) => `${n}°`).join(", ")}`,
  );
}
const mean = all.reduce((a, b) => a + b, 0) / all.length;
console.log(`\nfloor ${Math.min(...all)}°   mean ${mean.toFixed(1)}°`);
