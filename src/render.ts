// The canvas is a projection of state and holds none of it. Everything here
// reads GameState and draws; nothing here decides anything.
import {
  BIN_THICKNESS,
  NOMINAL_HEIGHT,
  OBSTACLE_HEIGHT,
  PAPER_RADIUS,
  POPUP_RISE,
  POPUP_TIME,
  PREVIEW_INTERVAL,
  PREVIEW_TIME,
  SHAFT_VIEWPORT_FRACTION,
  SHAFT_WIDTH,
  WALL_TICK_SPACING,
} from "./config.ts";
import { attractDots, attractLean, attractPull, previewFrom } from "./game.ts";
import type { GameState } from "./game.ts";
import { binHeight, driftX, obstacleBox } from "./geometry.ts";
import type { Bin } from "./geometry.ts";

const INK = "#2a2925";
const WALL = "#f2efe8";
const SHAFT = "#faf8f4";
const PAPER = "#fffdf8";

/** World-to-screen. The shaft is a fixed width in world units and the wall
 *  bleeds to the viewport edges, so there are no letterbox bars at either
 *  marking viewport --- a desktop simply sees more wall. */
export type View = {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly shaftLeft: number;
};

export function view(width: number, height: number): View {
  const scale = Math.min(
    (width * SHAFT_VIEWPORT_FRACTION) / SHAFT_WIDTH,
    height / NOMINAL_HEIGHT,
  );
  return { width, height, scale, shaftLeft: (width - SHAFT_WIDTH * scale) / 2 };
}

/** The crumple: a fixed irregular outline so the ball reads as paper rather
 *  than as a circle, rotated by its (purely cosmetic) spin. */
const CRUMPLE = [1, 0.92, 1.04, 0.88, 0.99, 1.05, 0.9, 1.01, 0.94, 1.03, 0.89];

export function render(ctx: CanvasRenderingContext2D, state: GameState, v: View): void {
  const world = state.sim.world;
  const sx = (x: number): number => v.shaftLeft + x * v.scale;
  const sy = (y: number): number => v.height - (y - state.cameraY) * v.scale;
  const u = (n: number): number => n * v.scale;

  // ---------------------------------------------------------------- ground
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, v.width, v.height);

  // Ticks on the wall, and only on the wall: without something to slide past,
  // a climb up an empty shaft doesn't read as a climb at all.
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.07;
  ctx.lineWidth = 1;
  const firstTick = Math.floor(state.cameraY / WALL_TICK_SPACING) * WALL_TICK_SPACING;
  for (let y = firstTick; y < state.cameraY + v.height / v.scale + WALL_TICK_SPACING; y += WALL_TICK_SPACING) {
    const py = Math.round(sy(y)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(sx(0), py);
    ctx.moveTo(sx(SHAFT_WIDTH), py);
    ctx.lineTo(v.width, py);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = SHAFT;
  ctx.fillRect(sx(0), 0, u(SHAFT_WIDTH), v.height);

  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u(2));
  ctx.beginPath();
  ctx.moveTo(sx(0), 0);
  ctx.lineTo(sx(0), v.height);
  ctx.moveTo(sx(SHAFT_WIDTH), 0);
  ctx.lineTo(sx(SHAFT_WIDTH), v.height);
  ctx.stroke();

  // ------------------------------------------------------------- obstacles
  ctx.fillStyle = INK;
  for (const o of world.obstacles) {
    const box = obstacleBox(o, world.t);
    ctx.fillRect(sx(box.minX), sy(box.maxY), u(o.width), u(OBSTACLE_HEIGHT));
  }

  // ------------------------------------------------------------------ bins
  drawBin(ctx, world.launcher, world.t, sx, sy, u, 0.45);
  drawBin(ctx, world.target, world.t, sx, sy, u, 1);

  // ----------------------------------------------------------- the preview
  const aimPull = state.phase === "aiming" ? state.aim?.pull : undefined;
  const showing =
    state.phase === "attract" ? attractPull(state.attractT, attractLean(world)) : aimPull;
  const dotAlpha = state.phase === "attract" ? attractDots(state.attractT) : 1;

  if (showing && dotAlpha > 0.001 && (showing.x !== 0 || showing.y !== 0)) {
    const dots = previewFrom(world, showing, PREVIEW_TIME, PREVIEW_INTERVAL);
    ctx.fillStyle = INK;
    dots.forEach((p, i) => {
      const k = i / Math.max(1, dots.length - 1);
      ctx.globalAlpha = (0.62 - k * 0.4) * dotAlpha;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), u(4 - k * 2.4), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // the band, from the bin's mouth to the drawn-back paper
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.3 * dotAlpha;
    ctx.lineWidth = Math.max(1, u(2));
    ctx.beginPath();
    ctx.moveTo(sx(driftX(world.launcher, world.t)), sy(world.launcher.y));
    ctx.lineTo(sx(world.paper.x), sy(world.paper.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------------- paper
  drawPaper(ctx, world.paper.x, world.paper.y, state.reducedMotion ? 0 : world.paper.angle, sx, sy, u);

  // ----------------------------------------------------------------- popup
  if (state.popup) {
    const k = state.popup.age / POPUP_TIME;
    const pop = state.reducedMotion ? 1 : k < 0.17 ? 0.9 + (k / 0.17) * 0.25 : 1.15;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.85 - k * k);
    ctx.fillStyle = INK;
    ctx.font = `${u(26) * pop}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${state.popup.points}`, sx(state.popup.x), sy(state.popup.y + k * POPUP_RISE));
    ctx.restore();
  }
}

function drawBin(
  ctx: CanvasRenderingContext2D,
  bin: Bin,
  t: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  u: (n: number) => number,
  alpha: number,
): void {
  const cx = driftX(bin, t);
  const half = bin.width / 2;
  const h = binHeight(bin);
  const bottom = bin.y - h;
  const T = BIN_THICKNESS;

  // A single U-shaped silhouette rather than three boxes: one shape to clip
  // the mesh into, and one stroke with no seams in it.
  //
  // It is laid down TWICE on purpose. clip() consumes the current path and
  // the hatch below needs a beginPath() of its own, which destroys it --- so
  // the outline has to be rebuilt before it can be stroked.
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(sx(cx - half), sy(bin.y));
    ctx.lineTo(sx(cx - half), sy(bottom));
    ctx.lineTo(sx(cx + half), sy(bottom));
    ctx.lineTo(sx(cx + half), sy(bin.y));
    ctx.lineTo(sx(cx + half - T), sy(bin.y));
    ctx.lineTo(sx(cx + half - T), sy(bottom + T));
    ctx.lineTo(sx(cx - half + T), sy(bottom + T));
    ctx.lineTo(sx(cx - half + T), sy(bin.y));
    ctx.closePath();
  };

  ctx.save();
  ctx.globalAlpha = alpha;
  outline();

  // The mesh covers the whole basket, not just the bars --- that is what a
  // wire bin looks like from the side, and confining the hatch to 6 units of
  // bar reads as a wireframe outline instead of as a bin.
  const left = sx(cx - half);
  const right = sx(cx + half);
  const top = sy(bin.y);
  const low = sy(bottom);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, low - top);
  ctx.clip();
  ctx.strokeStyle = INK;
  ctx.globalAlpha = alpha * 0.3;
  ctx.lineWidth = Math.max(1, u(1.2));
  const span = right - left + (low - top);
  ctx.beginPath();
  for (let d = -span; d < span; d += u(11)) {
    ctx.moveTo(left + d, top);
    ctx.lineTo(left + d + (low - top), low);
    ctx.moveTo(left + d, low);
    ctx.lineTo(left + d + (low - top), top);
  }
  ctx.stroke();
  ctx.restore();

  outline();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u(2));
  ctx.stroke();
  ctx.restore();
}

function drawPaper(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  sx: (n: number) => number,
  sy: (n: number) => number,
  u: (n: number) => number,
): void {
  ctx.save();
  ctx.translate(sx(x), sy(y));
  ctx.rotate(-angle);
  ctx.beginPath();
  CRUMPLE.forEach((r, i) => {
    const a = (i / CRUMPLE.length) * Math.PI * 2;
    const px = Math.cos(a) * u(PAPER_RADIUS) * r;
    const py = Math.sin(a) * u(PAPER_RADIUS) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u(2));
  ctx.stroke();

  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(1, u(1.5));
  ctx.beginPath();
  ctx.moveTo(-u(7), -u(3));
  ctx.lineTo(u(2), u(5));
  ctx.moveTo(u(1), -u(8));
  ctx.lineTo(u(6), u(1));
  ctx.stroke();
  ctx.restore();
}
