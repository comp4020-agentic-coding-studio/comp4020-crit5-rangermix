import { TIER_SIZE } from "./config.ts";

/**
 * Everything about a level that isn't its position: how big the bin is, how
 * far away, how much it moves, and what's in the way.
 *
 * Every field is a clamped function of the tier, so escalation is continuous,
 * pure and testable, and the late game asymptotes instead of running away.
 */
export type Params = {
  /** Outer width of the target bin, in world units. */
  readonly binWidth: number;
  /** Vertical distance from the launcher's rim to the target's. */
  readonly gap: number;
  /** Horizontal drift, half-amplitude. 0 means a static bin. */
  readonly driftAmplitude: number;
  /** Drift oscillations per second. 0 means a static bin. */
  readonly driftFrequency: number;
  readonly obstacleCount: number;
  readonly obstaclesDrift: boolean;
  /** How far sideways the next bin may sit, as a fraction of the shaft. The
   *  quietest difficulty lever there is: the first levels sit almost overhead
   *  so the opening shot is forgiving, and they fan out from there. */
  readonly minOffset: number;
  readonly maxOffset: number;
};

/** Levels 1-5 are tier 0, 6-10 tier 1, and so on. */
export function tier(level: number): number {
  return Math.floor((level - 1) / TIER_SIZE);
}

export function params(level: number): Params {
  const t = tier(level);
  return {
    binWidth: Math.max(84, 130 - 9 * t),
    gap: Math.min(420, 260 + 26 * t),
    driftAmplitude: t === 0 ? 0 : Math.min(120, 20 + 20 * t),
    driftFrequency: t === 0 ? 0 : Math.min(0.7, 0.3 + 0.08 * t),
    obstacleCount: t < 2 ? 0 : Math.min(2, t - 1),
    obstaclesDrift: t >= 4,
    minOffset: Math.min(0.15, 0.1 + 0.01 * t),
    maxOffset: Math.min(0.75, 0.4 + 0.07 * t),
  };
}
