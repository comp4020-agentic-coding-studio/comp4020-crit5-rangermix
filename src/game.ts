// The whole game as one pure function: reduce(state, event) -> state.
//
// Nothing in here knows about a canvas, a pointer, an AudioContext or
// localStorage. That is what lets every rule the player can feel --- lives,
// combo, when a run ends --- be asserted in a test with no browser at all.
import {
  ATTRACT_CYCLE,
  CAMERA_ANCHOR,
  CAMERA_PAN,
  CAMERA_PAN_REDUCED,
  FULL_POWER_PULL,
  MAX_DRAW_BACK,
  MAX_FLIGHT_TIME,
  MAX_LAUNCH_SPEED,
  MIN_PULL_PX,
  NOMINAL_HEIGHT,
  PAPER_RADIUS,
  POPUP_TIME,
  REST_SPEED,
  REST_TIME,
  STARTING_LIVES,
} from "./config.ts";
import { driftX } from "./geometry.ts";
import type { Bin } from "./geometry.ts";
import { firstLauncher, nextLevel } from "./level.ts";
import { advance, launchVelocity, simulate } from "./physics.ts";
import type { Sim, World } from "./physics.ts";
import { next, seed } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { points } from "./scoring.ts";
import { len, normalize } from "./vec.ts";
import type { Vec } from "./vec.ts";

export type Phase = "attract" | "aiming" | "flight" | "panning" | "gameover";

/** What the player did, in world terms. Screen pixels never reach here. */
export type GameEvent =
  | { readonly type: "tick"; readonly dt: number }
  | { readonly type: "aimStart" }
  | { readonly type: "aimMove"; readonly pull: Vec; readonly pullPx: number }
  | { readonly type: "aimEnd" }
  | { readonly type: "aimCancel" }
  | { readonly type: "restart" };

export type Sound = "wall" | "bin" | "obstacle" | "score" | "life" | "over";

export type Popup = {
  readonly points: number;
  readonly x: number;
  readonly y: number;
  readonly age: number;
};

export type GameState = {
  readonly phase: Phase;
  readonly level: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly lives: number;
  /** Best score on this device. Injected at boot; the reducer only raises it. */
  readonly best: number;

  readonly sim: Sim;
  readonly rng: RngState;

  readonly aim: { readonly pull: Vec; readonly pullPx: number } | null;
  readonly flightTime: number;
  readonly restTime: number;

  readonly popup: Popup | null;

  /** World y at the bottom of the frame. */
  readonly cameraY: number;
  readonly panFrom: number;
  readonly panProgress: number;

  /** Once true, the attract loop never runs again: the player has shown they
   *  know the gesture, and repeating the lesson would be nagging. */
  readonly hasLaunched: boolean;
  readonly attractT: number;
  /** Guards the end screen from the same tap that caused it. */
  readonly gameoverT: number;

  readonly reducedMotion: boolean;
};

export type Reduced = { readonly state: GameState; readonly sounds: readonly Sound[] };

const cameraFor = (launcher: Bin): number => launcher.y - CAMERA_ANCHOR * NOMINAL_HEIGHT;

/** Where the paper sits when it isn't flying: in the launcher, drawn back by
 *  however hard the player is pulling. */
function atRest(world: World, pull: Vec | null): World {
  let dx = 0;
  let dy = 0;
  if (pull) {
    const power = Math.min(1, len(pull) / FULL_POWER_PULL);
    const dir = normalize(pull);
    dx = -dir.x * MAX_DRAW_BACK * power;
    dy = -dir.y * MAX_DRAW_BACK * power;
  }
  return {
    ...world,
    paper: {
      ...world.paper,
      x: driftX(world.launcher, world.t) + dx,
      y: world.launcher.y + dy,
      vx: 0,
      vy: 0,
      spin: 0,
    },
  };
}

export function initial(rngSeed: number, best = 0, reducedMotion = false): GameState {
  const launcher = firstLauncher();
  const first = nextLevel(launcher, 1, seed(rngSeed));
  const world: World = {
    t: 0,
    paper: { x: launcher.xBase, y: launcher.y, vx: 0, vy: 0, angle: 0, spin: 0 },
    launcher,
    target: first.target,
    obstacles: first.obstacles,
    launcherArmed: false,
  };
  return {
    phase: "attract",
    level: 1,
    score: 0,
    combo: 0,
    maxCombo: 0,
    lives: STARTING_LIVES,
    best,
    sim: { world, accumulator: 0 },
    rng: first.rng,
    aim: null,
    flightTime: 0,
    restTime: 0,
    popup: null,
    cameraY: cameraFor(launcher),
    panFrom: cameraFor(launcher),
    panProgress: 1,
    hasLaunched: false,
    attractT: 0,
    gameoverT: 0,
    reducedMotion,
  };
}

/** Advance the world clock without touching the paper's flight --- bins drift
 *  while you aim, which is most of what makes aiming interesting. */
function idleWorld(world: World, dt: number, pull: Vec | null): World {
  return atRest({ ...world, t: world.t + dt }, pull);
}

const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

function agePopup(popup: Popup | null, dt: number): Popup | null {
  if (!popup) return null;
  const age = popup.age + dt;
  return age >= POPUP_TIME ? null : { ...popup, age };
}

/** A capture: score it, climb, and set the next bin up. */
function onCapture(state: GameState): Reduced {
  const world = state.sim.world;
  const combo = state.combo + 1;
  const gained = points(combo);
  const level = state.level + 1;

  // the bin just landed in becomes the bin thrown from, keeping its offset
  // from the wall and its motion --- that is the whole idea of the game
  const launcher = world.target;
  const next = nextLevel(launcher, level, state.rng);

  return {
    state: {
      ...state,
      phase: "panning",
      level,
      score: state.score + gained,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      sim: {
        world: atRest(
          { ...world, launcher, target: next.target, obstacles: next.obstacles, launcherArmed: false },
          null,
        ),
        accumulator: 0,
      },
      rng: next.rng,
      aim: null,
      popup: { points: gained, x: driftX(launcher, world.t), y: launcher.y, age: 0 },
      panFrom: state.cameraY,
      panProgress: 0,
    },
    sounds: ["score"],
  };
}

/** A miss: one life, and the combo with it. The bin and the shot's origin are
 *  untouched --- you throw again at the same target, from the same place. */
function onMiss(state: GameState): Reduced {
  const over = state.lives === 0;
  return {
    state: {
      ...state,
      phase: over ? "gameover" : "aiming",
      lives: over ? 0 : state.lives - 1,
      combo: 0,
      best: over ? Math.max(state.best, state.score) : state.best,
      sim: { world: atRest(state.sim.world, null), accumulator: 0 },
      aim: null,
      flightTime: 0,
      restTime: 0,
      gameoverT: 0,
    },
    sounds: over ? ["over"] : ["life"],
  };
}

function onTick(state: GameState, dt: number): Reduced {
  const popup = agePopup(state.popup, dt);

  switch (state.phase) {
    case "attract":
      return {
        state: {
          ...state,
          attractT: (state.attractT + dt) % ATTRACT_CYCLE,
          sim: { ...state.sim, world: idleWorld(state.sim.world, dt, null) },
          popup,
        },
        sounds: [],
      };

    case "aiming":
      return {
        state: {
          ...state,
          sim: { ...state.sim, world: idleWorld(state.sim.world, dt, state.aim?.pull ?? null) },
          popup,
        },
        sounds: [],
      };

    case "panning": {
      const duration = state.reducedMotion ? CAMERA_PAN_REDUCED : CAMERA_PAN;
      const panProgress = Math.min(1, state.panProgress + dt / duration);
      const to = cameraFor(state.sim.world.launcher);
      return {
        state: {
          ...state,
          phase: panProgress >= 1 ? "aiming" : "panning",
          panProgress,
          cameraY: state.panFrom + (to - state.panFrom) * easeInOutCubic(panProgress),
          sim: { ...state.sim, world: idleWorld(state.sim.world, dt, null) },
          popup,
        },
        sounds: [],
      };
    }

    case "gameover":
      return { state: { ...state, gameoverT: state.gameoverT + dt, popup }, sounds: [] };

    case "flight": {
      const stepped = advance(state.sim, dt);
      const sounds: Sound[] = stepped.contacts.map((c) => c.kind);
      const flightTime = state.flightTime + dt;
      const paper = stepped.sim.world.paper;

      const slow = Math.hypot(paper.vx, paper.vy) < REST_SPEED;
      const restTime = slow ? state.restTime + dt : 0;

      const next: GameState = { ...state, sim: stepped.sim, flightTime, restTime, popup };

      if (stepped.captured) {
        const captured = onCapture(next);
        return { state: captured.state, sounds: [...sounds, ...captured.sounds] };
      }

      const missed =
        paper.y < state.cameraY - PAPER_RADIUS * 4 ||
        flightTime > MAX_FLIGHT_TIME ||
        restTime > REST_TIME;

      if (missed) {
        const miss = onMiss(next);
        return { state: miss.state, sounds: [...sounds, ...miss.sounds] };
      }

      return { state: next, sounds };
    }
  }
}

export function reduce(state: GameState, event: GameEvent): Reduced {
  switch (event.type) {
    case "tick":
      return onTick(state, event.dt);

    case "aimStart":
      if (state.phase === "gameover") {
        // ignore the tap that produced the end screen, then let any tap restart
        return state.gameoverT < 0.6
          ? { state, sounds: [] }
          : { state: restart(state), sounds: [] };
      }
      if (state.phase !== "attract" && state.phase !== "aiming") return { state, sounds: [] };
      return {
        state: { ...state, phase: "aiming", aim: { pull: { x: 0, y: 0 }, pullPx: 0 } },
        sounds: [],
      };

    case "aimMove":
      if (state.phase !== "aiming" || !state.aim) return { state, sounds: [] };
      return {
        state: {
          ...state,
          aim: { pull: event.pull, pullPx: event.pullPx },
          sim: { ...state.sim, world: atRest(state.sim.world, event.pull) },
        },
        sounds: [],
      };

    case "aimCancel":
      if (state.phase !== "aiming") return { state, sounds: [] };
      return {
        state: { ...state, aim: null, sim: { ...state.sim, world: atRest(state.sim.world, null) } },
        sounds: [],
      };

    case "aimEnd": {
      if (state.phase !== "aiming" || !state.aim) return { state, sounds: [] };
      // below the threshold this was a tap, not a shot: cost the player nothing
      if (state.aim.pullPx < MIN_PULL_PX) {
        return {
          state: {
            ...state,
            aim: null,
            sim: { ...state.sim, world: atRest(state.sim.world, null) },
          },
          sounds: [],
        };
      }
      return { state: launch(state, state.aim.pull), sounds: [] };
    }

    case "restart":
      return { state: restart(state), sounds: [] };
  }
}

function launch(state: GameState, pull: Vec): GameState {
  const world = state.sim.world;
  const v = launchVelocity(pull);
  return {
    ...state,
    phase: "flight",
    aim: null,
    hasLaunched: true,
    flightTime: 0,
    restTime: 0,
    sim: {
      accumulator: 0,
      world: {
        ...world,
        launcherArmed: false,
        paper: {
          x: driftX(world.launcher, world.t),
          y: world.launcher.y,
          vx: v.x,
          vy: v.y,
          angle: world.paper.angle,
          // spin is cosmetic; sideways shots tumble more than straight ones
          spin: (-v.x / MAX_LAUNCH_SPEED) * 14,
        },
      },
    },
  };
}

function restart(state: GameState): GameState {
  const [draw] = next(state.rng);
  const fresh = initial(
    Math.floor(draw * 0x100000000),
    Math.max(state.best, state.score),
    state.reducedMotion,
  );
  // the attract loop has done its job once; it does not come back
  return { ...fresh, phase: "aiming", hasLaunched: state.hasLaunched };
}

/** The trajectory preview, for whatever is currently being aimed. Derived
 *  state --- it belongs to the view --- but it runs simulate(), the same code
 *  path as live flight, so the dots cannot drift out of agreement with it. */
export function previewFrom(world: World, pull: Vec, maxTime: number, interval: number): Vec[] {
  const v = launchVelocity(pull);
  return simulate(
    {
      ...world,
      launcherArmed: false,
      paper: {
        ...world.paper,
        x: driftX(world.launcher, world.t),
        y: world.launcher.y,
        vx: v.x,
        vy: v.y,
      },
    },
    maxTime,
    interval,
  );
}
