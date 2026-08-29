// Wiring only. Everything that decides anything lives in src/game.ts; this
// file owns the things a pure reducer must not: the canvas, the clock, the
// pointer, the DOM overlay and localStorage.
import { playSound, unlockAudio } from "./src/audio.ts";
import { BEST_KEY, FULL_POWER_PULL } from "./src/config.ts";
import { initial, reduce } from "./src/game.ts";
import type { GameEvent, GameState } from "./src/game.ts";
import { attachKeyboard, attachPointer } from "./src/input.ts";
import { render, view } from "./src/render.ts";

/** index.html and this file are one artefact; if a hook is gone, the page is
 *  broken in a way no fallback rendering would disguise. */
function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the game shell has no ${what}`);
  return value;
}

const canvas = need(document.querySelector<HTMLCanvasElement>("#stage"), "canvas");
const ctx = need(canvas.getContext("2d"), "2d context");
const livesEl = need(document.getElementById("lives"), "lives row");
const scoreEl = need(document.getElementById("score"), "score");
const endEl = need(document.getElementById("end"), "end screen");

const dots = [...livesEl.querySelectorAll<HTMLElement>(".dot")];
const endLevel = need(document.getElementById("end-level"), "end level");
const endScore = need(document.getElementById("end-score"), "end score");
const endBest = need(document.getElementById("end-best"), "end best");
const endCombo = need(document.getElementById("end-combo"), "end combo");

/** Browsers in a private window, or with site data blocked, throw on access
 *  rather than returning nothing. A missing best score is not worth a crash. */
function loadBest(): number {
  try {
    return Number.parseInt(localStorage.getItem(BEST_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* nothing to do, and nothing worth telling the player */
  }
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let state: GameState = initial(Math.floor(Math.random() * 0x100000000), loadBest(), reducedMotion);

const send = (event: GameEvent): void => {
  const { state: next, sounds } = reduce(state, event);
  state = next;
  for (const sound of sounds) playSound(sound);
};

// ------------------------------------------------------------------ canvas

let bounds = view(1, 1);

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bounds = view(width, height);
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);

// ------------------------------------------------------------------- input

// Browsers will not start audio before a gesture, so the first touch of the
// game is also what turns the sound on.
canvas.addEventListener("pointerdown", unlockAudio, { once: false });
canvas.addEventListener("keydown", unlockAudio, { once: false });

attachPointer(canvas, send, () => bounds.scale);

// Space charges on a repeating triangle so the keyboard has a power control
// at all; 1.2s up, 1.2s down, until it is released.
let chargeStart = 0;
const keyboardTick = attachKeyboard(canvas, (event) => {
  if (event.type === "aimStart") chargeStart = performance.now();
  send(event);
}, () => {
  const phase = ((performance.now() - chargeStart) / 1200) % 2;
  return FULL_POWER_PULL * (phase < 1 ? phase : 2 - phase);
});

// ---------------------------------------------------------------- overlay

let shownLives = -1;
let shownScore = -1;
let shownEnd = false;

function syncOverlay(): void {
  if (state.lives !== shownLives) {
    dots.forEach((dot, i) => dot.classList.toggle("is-lost", i >= state.lives));
    if (shownLives >= 0 && state.lives < shownLives) {
      livesEl.classList.remove("is-shaken");
      void livesEl.offsetWidth; // restart the animation
      livesEl.classList.add("is-shaken");
    }
    shownLives = state.lives;
  }

  if (state.score !== shownScore) {
    scoreEl.textContent = String(state.score);
    if (shownScore >= 0) {
      scoreEl.classList.remove("is-bumped");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("is-bumped");
    }
    shownScore = state.score;
  }

  const over = state.phase === "gameover";
  if (over !== shownEnd) {
    if (over) {
      endLevel.textContent = String(state.level);
      endScore.textContent = String(state.score);
      endBest.textContent = String(Math.max(state.best, state.score));
      endCombo.textContent = String(state.maxCombo);
      saveBest(Math.max(state.best, state.score));
    }
    endEl.hidden = !over;
    shownEnd = over;
  }
}

// -------------------------------------------------------------------- loop

let last = performance.now();

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  keyboardTick();
  send({ type: "tick", dt });
  render(ctx, state, bounds);
  syncOverlay();
  requestAnimationFrame(frame);
}

// A backgrounded tab stops getting frames; without this the first frame back
// carries the whole absence and the shot in flight teleports.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) last = performance.now();
});

resize();
canvas.focus();
requestAnimationFrame(frame);
