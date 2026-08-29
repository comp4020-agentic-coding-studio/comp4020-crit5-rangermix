import { COMBO_STEP, MAX_POINTS } from "./config.ts";

/**
 * Points for a capture.
 *
 * `combo` counts consecutive captures INCLUDING the one being scored, so the
 * first capture of a run scores with combo 1. spec/paper-jump.md §6.
 *
 *   combo  1 → +1      combo 10 → +3
 *   combo  5 → +2      combo 20 → +5 (the cap)
 */
export function points(combo: number): number {
  return Math.min(MAX_POINTS, 1 + Math.floor(combo / COMBO_STEP));
}
