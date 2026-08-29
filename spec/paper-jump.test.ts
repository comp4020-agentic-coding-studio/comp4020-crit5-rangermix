// The week's contract tests: spec/paper-jump.md turned into assertions.
//
// These test what the game must DO, not how it's built --- they'd survive
// swapping the renderer or the integrator. Everything under test is a pure
// function over plain data, which is why none of this needs a canvas or a DOM.
import { describe, expect, it } from "vitest";
import { params, tier } from "../src/difficulty.ts";
import { points } from "../src/scoring.ts";

describe("scoring: 1 + floor(combo / 5), capped at 5", () => {
  // spec/paper-jump.md §6. Combo counts consecutive captures INCLUDING the
  // one being scored.
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
    [14, 3],
    [15, 4],
    [19, 4],
    [20, 5],
  ])("combo %i scores %i", (combo, expected) => {
    expect(points(combo)).toBe(expected);
  });

  it("caps at 5 however long the combo runs", () => {
    for (const combo of [21, 25, 40, 100, 1000]) {
      expect(points(combo)).toBe(5);
    }
  });

  it("only ever returns whole numbers", () => {
    for (let combo = 1; combo <= 60; combo++) {
      expect(Number.isInteger(points(combo))).toBe(true);
    }
  });
});

describe("difficulty tiers", () => {
  it("changes tier every five levels", () => {
    expect(tier(1)).toBe(0);
    expect(tier(5)).toBe(0);
    expect(tier(6)).toBe(1);
    expect(tier(10)).toBe(1);
    expect(tier(11)).toBe(2);
  });

  it("gives the first five levels a still, generous shaft", () => {
    // Tier 0 has to be learnable with no words at all, so nothing moves and
    // nothing is in the way.
    for (let level = 1; level <= 5; level++) {
      const p = params(level);
      expect(p.driftAmplitude).toBe(0);
      expect(p.driftFrequency).toBe(0);
      expect(p.obstacleCount).toBe(0);
    }
  });

  it("escalates monotonically", () => {
    for (let level = 2; level <= 80; level++) {
      const prev = params(level - 1);
      const cur = params(level);
      expect(cur.binWidth).toBeLessThanOrEqual(prev.binWidth);
      expect(cur.gap).toBeGreaterThanOrEqual(prev.gap);
      expect(cur.driftAmplitude).toBeGreaterThanOrEqual(prev.driftAmplitude);
      expect(cur.obstacleCount).toBeGreaterThanOrEqual(prev.obstacleCount);
    }
  });

  it("asymptotes rather than running away", () => {
    // A player good enough to reach level 200 should meet a hard game, not an
    // impossible one.
    const late = params(200);
    expect(late.binWidth).toBe(78);
    expect(late.gap).toBe(480);
    expect(late.driftAmplitude).toBe(140);
    expect(late.driftFrequency).toBeCloseTo(0.75, 10);
    expect(late.obstacleCount).toBe(3);
    expect(late.obstaclesDrift).toBe(true);
  });

  it("introduces obstacles from tier 2 and moves them from tier 4", () => {
    expect(params(10).obstacleCount).toBe(0);
    expect(params(11).obstacleCount).toBe(1);
    expect(params(16).obstaclesDrift).toBe(false);
    expect(params(21).obstaclesDrift).toBe(true);
  });
});
