# Process overview

## What I built

**paper jump** — a paper-toss game up a narrow shaft, where the bin you land in
becomes the bin you throw from. The preview shows a third of a second and stops
at the first wall, so aiming is given to you and the bounce is earned. No
instructions anywhere: the opening screen mimes the drag, then retires itself.

## The moments that mattered

**Measuring difficulty in a unit a person actually has.** A reachability test
failed on level 17 — not a bad seed: the constants ran the gap to 480u against
a maximum rise of 560u, and that level had nine working shots in 51,300 sampled
launches. Rather than nudge numbers until green, I built a probe. My first
metric was wrong — raw solution density punishes a near-overhead bin humans
find easy. **Aim tolerance**, the widest unbroken band of launch angles that
still scores, reads straight against a thumb's 3–5° precision. It kept earning
its keep: easing the game later by a requested 20% became a measurement
(13.0° → 16.9° mean, 23% easier), and it showed the *floor* moves on obstacle
count, not on gap or bin width. [`428d3d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-rangermix/commit/428d3d4)

**Six preview dots is a legible arc on paper and two in the hand.** Most shots
are cut short by the target bin — exactly where you aim. Sampling three times
as densely fixes legibility without extending the horizon, so the difficulty
lever is untouched. [`387ee2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-rangermix/commit/387ee2f)

| before — every 0.055s | after — every 0.03s |
| --- | --- |
| ![Two faint preview dots](docs/preview-before.png) | ![Eleven dots forming a readable arc](docs/preview-after.png) |

**A regression test that passes before the fix has no teeth.** Play surfaced a
capture bug: the paper goes in over the edge, then rattles inside a bin that
refuses to score it. My first test for it passed with the fix *reverted* — it
swept static bins, and the bug needs a drifting one. Reverting a fix to watch
its test fail is now a standing rule. [`1aad0f2`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-rangermix/commit/1aad0f2)

Three sensors outlast this brief: the aim-tolerance floor, the trap regression,
and an allowlist over the built page's visible text. [`5046f7c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-rangermix/commit/5046f7c)
