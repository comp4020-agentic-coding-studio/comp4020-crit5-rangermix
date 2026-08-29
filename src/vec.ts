// Two-dimensional arithmetic, kept deliberately small: the physics only ever
// needs a length, a normal and a reflection.

export type Vec = { readonly x: number; readonly y: number };

export const len = (v: Vec): number => Math.hypot(v.x, v.y);

export const scale = (v: Vec, k: number): Vec => ({ x: v.x * k, y: v.y * k });

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });

export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

/** Unit vector, or (0, 0) for a zero-length input --- callers treat that as
 *  "no direction" rather than having to guard for NaN. */
export function normalize(v: Vec): Vec {
  const l = len(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

export const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;
