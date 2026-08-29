// mulberry32: a whole PRNG in one uint32 of state.
//
// The state is a plain number so it can live inside GameState, which is what
// keeps `reduce` pure and makes a run reproducible from its seed alone. Every
// function here takes a state and returns the next one; nothing is hidden in a
// closure.

export type RngState = number;

export const seed = (n: number): RngState => n >>> 0;

/** A float in [0, 1), and the next state. */
export function next(state: RngState): [number, RngState] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** A float in [lo, hi), and the next state. */
export function range(state: RngState, lo: number, hi: number): [number, RngState] {
  const [v, s] = next(state);
  return [lo + v * (hi - lo), s];
}

/** An integer in [0, n), and the next state. */
export function int(state: RngState, n: number): [number, RngState] {
  const [v, s] = next(state);
  return [Math.floor(v * n), s];
}

/** -1 or 1, and the next state. */
export function sign(state: RngState): [number, RngState] {
  const [v, s] = next(state);
  return [v < 0.5 ? -1 : 1, s];
}
