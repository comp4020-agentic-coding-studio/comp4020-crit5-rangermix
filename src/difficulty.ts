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
};

/** Levels 1-5 are tier 0, 6-10 tier 1, and so on. */
export function tier(level: number): number {
  return Math.floor((level - 1) / TIER_SIZE);
}

export function params(level: number): Params {
  const t = tier(level);
  return {
    binWidth: Math.max(78, 130 - 11 * t),
    gap: Math.min(480, 300 + 38 * t),
    driftAmplitude: t === 0 ? 0 : Math.min(140, 25 + 25 * t),
    driftFrequency: t === 0 ? 0 : Math.min(0.75, 0.3 + 0.09 * t),
    obstacleCount: t < 2 ? 0 : Math.min(3, t - 1),
    obstaclesDrift: t >= 4,
  };
}
