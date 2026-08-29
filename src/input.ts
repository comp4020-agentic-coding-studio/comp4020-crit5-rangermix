// Pointer and keyboard, translated into the events the reducer understands.
// Screen pixels stop here: everything sent onward is in world units.
import { MIN_PULL_PX } from "./config.ts";
import type { GameEvent } from "./game.ts";

export type Send = (event: GameEvent) => void;

/**
 * One code path for mouse, touch and pen.
 *
 * A drag may START ANYWHERE in the playfield rather than on the paper: the
 * ball is 14 world units across and often drifting, and a thumb cannot
 * reliably find it on a phone. The shot always leaves the bin regardless.
 */
export function attachPointer(canvas: HTMLCanvasElement, send: Send, scale: () => number): void {
  let origin: { x: number; y: number } | null = null;
  let pointerId: number | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (pointerId !== null) return; // a second finger is not a second sling
    pointerId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    send({ type: "aimStart" });
  });

  canvas.addEventListener("pointermove", (e) => {
    if (origin === null || e.pointerId !== pointerId) return;
    const dx = origin.x - e.clientX;
    const dy = origin.y - e.clientY;
    const k = scale();
    // Screen y grows downward and world y grows upward, so dragging DOWN has
    // to become a pull that flings UP.
    send({
      type: "aimMove",
      pull: { x: dx / k, y: -dy / k },
      pullPx: Math.hypot(dx, dy),
    });
  });

  const finish = (e: PointerEvent, cancelled: boolean): void => {
    if (e.pointerId !== pointerId) return;
    origin = null;
    pointerId = null;
    send({ type: cancelled ? "aimCancel" : "aimEnd" });
  };

  canvas.addEventListener("pointerup", (e) => finish(e, false));
  canvas.addEventListener("pointercancel", (e) => finish(e, true));
}

/**
 * Keyboard play. Not the primary control, but a game that is unplayable
 * without a pointer is a game that falls over the moment it meets a
 * keyboard: arrows aim, space charges and releases, Enter restarts.
 */
export function attachKeyboard(target: HTMLElement, send: Send, power: () => number): () => void {
  let angle = Math.PI / 2;
  let charging = false;

  const pull = (): { x: number; y: number } => {
    const p = power();
    return { x: Math.cos(angle) * p, y: Math.sin(angle) * p };
  };

  target.addEventListener("keydown", (e) => {
    const fine = e.shiftKey ? 0.7 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      angle += (e.key === "ArrowLeft" ? 1 : -1) * ((5 * fine * Math.PI) / 180);
      angle = Math.min(Math.PI - 0.05, Math.max(0.05, angle));
      if (charging) send({ type: "aimMove", pull: pull(), pullPx: MIN_PULL_PX * 2 });
    } else if (e.key === " " && !charging) {
      e.preventDefault();
      charging = true;
      send({ type: "aimStart" });
      send({ type: "aimMove", pull: pull(), pullPx: MIN_PULL_PX * 2 });
    } else if (e.key === "Enter") {
      e.preventDefault();
      send({ type: "restart" });
    }
  });

  target.addEventListener("keyup", (e) => {
    if (e.key === " " && charging) {
      e.preventDefault();
      charging = false;
      send({ type: "aimEnd" });
    }
  });

  // While space is held the reducer needs the power sweep pushed at it each
  // frame; main.ts calls this from the loop.
  return (): void => {
    if (charging) send({ type: "aimMove", pull: pull(), pullPx: MIN_PULL_PX * 2 });
  };
}
