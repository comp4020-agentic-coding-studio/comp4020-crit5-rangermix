# paper jump — game spec

The design contract for this week's prototype. The course's published spec (the
fixed contract I'm marked against) is on the
[crit 5 page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/);
this file is the design I'm answering it with, and the `spec/*.test.ts` files
assert the mechanically checkable parts of it.

---

## 1. The idea

A paper toss game where the bin you land in becomes the bin you throw from.

You crumple a sheet, sling it out of a wastepaper bin, and try to land it in
another bin further up a narrow shaft. Land it and the camera climbs: that bin
is now your launcher, keeping the exact horizontal offset and drift it had as a
target. Miss and you lose one of three lives and throw again at the same bin.

Two mechanics that interact, which is what carries the five minutes:

1. **the slingshot** — pull back, release, an Angry-Birds arc
2. **the walls** — the shaft is narrow and its walls are live, so a bounced
   shot reaches places a direct arc can't

The trajectory preview deliberately shows only the first fraction of a second
and stops dead at the first wall. Aiming is given to you; **predicting the
bounce is the whole skill.** That's the depth under a mechanic simple enough to
need no words.

### Answering the brief's hard constraint

No instructions anywhere — the opening screen has to make the first move
obvious. Nothing on screen says "drag". Instead, §7.1 specifies an **attract
loop**: the paper visibly draws itself back out of the bin and springs forward,
on a slow repeat, with the preview dots appearing at the top of the pull. It
demonstrates the gesture rather than describing it, and it retires permanently
the moment the player completes their first drag.

---

## 2. Playfield and coordinate system

A vertical shaft cut into a flat wall. The camera scrolls up.

```
  ┃                       ┃
  ┃           ╭────────╮  ┃   target bin (may drift ↔)
  ┃           ╰────────╯  ┃
  ┃                       ┃
  ┃        ▇▇▇▇▇          ┃   obstacle (tier 2+)
  ┃                       ┃
  ┃   · ·                 ┃   preview dots, fading
  ┃  ·                    ┃
  ┃ ╭───◉────╮            ┃   launcher = last target,
  ┃ ╰────────╯            ┃   same x-offset, same drift
  ┃                       ┃
 wall                    wall
```

### World units

+x right, **+y up**, origin at the shaft's bottom-left at level 1.

| Constant | Value | Note |
| --- | --- | --- |
| `SHAFT_WIDTH` | 420 u | inner face to inner face; the gameplay-critical dimension |
| `NOMINAL_HEIGHT` | 960 u | the vertical span difficulty is defined against |

### Fitting the two marking viewports

1920×1080 and 390×844 are wildly different shapes (1.78 vs 0.46), so the shaft
is a **fixed-width column** and the wall bleeds to the viewport edges. There are
no letterbox bars at either viewport — on desktop you simply see more wall.

```
scale = min(viewportWidth * 0.94 / SHAFT_WIDTH, viewportHeight / NOMINAL_HEIGHT)
visibleWorldHeight = viewportHeight / scale
```

| Viewport | scale | shaft on screen | visible world height |
| --- | --- | --- | --- |
| 390×844 | 0.873 | 367 px (11 px wall each side) | 967 u |
| 1920×1080 | 1.125 | 472 px (724 px wall each side) | 960 u |

Gameplay is identical at both: every difficulty quantity in §6 is expressed
against `NOMINAL_HEIGHT`, never against the visible height, so the ~7 u a narrow
phone gains is context, not advantage.

**The desktop wall is not dead space.** It carries faint horizontal tick lines
every 240 u that scroll with the camera — the only thing that makes the climb
legible as a climb.

### Camera

The launcher bin's rim sits at `0.22 * NOMINAL_HEIGHT` above the bottom of the
frame. On a capture the camera eases to the new launcher's framing over 520 ms
(`easeInOutCubic`). Nothing is interactive during the pan.

### Resize

Recompute `scale` and re-lay out on `resize` and `orientationchange`. A resize
mid-flight must not disturb the simulation — the world is in world units and
only the projection changes. **A resize mid-drag keeps the drag alive**, using
the new scale from the next pointer event onward.

---

## 3. Entities

### Paper

A circle collider, drawn as a crumpled ball.

| Property | Value |
| --- | --- |
| radius | 14 u |
| launch offset | rests visually in the launcher's cavity, but **collision with the launcher is disabled until the paper clears the rim plane + radius** — so a shallow shot can't bonk its own bin |
| visual | off-white irregular 8-gon, charcoal outline, 3 crease strokes, rotates with angular velocity |

Angular velocity is cosmetic — set from launch speed, reversed and scaled on
each bounce. It never feeds back into the physics.

### Bin

An open-topped mesh basket. Three colliders plus a capture zone.

```
              ┌┐          ┌┐              ← left bar / right bar
              ││   ░░░░   ││
              ││  ░░░░░░  ││                ← capture zone (cavity)
              └┴──────────┴┘                ← floor
              ←─ innerWidth ─→
        ←──────  width  ──────→
```

| Property | Value |
| --- | --- |
| `width` | tier-dependent, 130 → 78 u (§6) |
| `height` | `0.62 * width` |
| wall thickness | 6 u |
| `innerWidth` | `width - 12` |
| colliders | three AABBs — left bar, right bar, floor |
| restitution | 0.40, uniform |

Circle-vs-AABB by the closest-point method already returns a corner-anchored
normal, which *is* a rounded rim response, so no separate rim-cap primitives are
needed. The single deadened restitution means a shot that clips the rim usually
drops in rather than pinging away — a generosity the player feels but never
reads.

**Only the target captures.** The launcher stays a collider once the paper has
cleared it, so a shot straight up drops back into your own bin, rattles on its
floor and settles; the rest rule in §6 then declares the miss.

**Drift.** From tier 1, a bin oscillates horizontally:
`x(t) = xBase + amplitude * sin(2π * frequency * t + phase)`. `phase` is fixed
at spawn. `xBase` is clamped so the bin's full swing stays inside the shaft.

### Wall

Two vertical planes at `x = 0` and `x = SHAFT_WIDTH`, infinite in y.

| Property | Value |
| --- | --- |
| restitution | 0.55 |
| tangential retention | 0.92 |

### Obstacle

Axis-aligned bars (tier 2+), width 60–140 u, height 14 u, restitution 0.60.
From tier 4 they drift on the same sine form as bins.

---

## 4. Physics

Deterministic, fixed-timestep, hand-rolled. **No physics library** — the
preview in §5 must simulate with the exact same code path, and determinism is
what makes §10's tests possible.

| Constant | Value |
| --- | --- |
| gravity | 1800 u/s² down |
| linear damping | 0.20 /s |
| substep | 1/240 s |
| max launch speed | 1500 u/s |
| max flight time | 8 s |

Semi-implicit Euler per substep:

```
v += (0, -g) * dt
v *= (1 - damping * dt)
p += v * dt
resolve collisions
test capture
```

The accumulator drains in fixed substeps with the remainder carried, so frame
rate never changes the outcome. At 1500 u/s a substep advances 6.25 u against a
paper radius of 14 u, so tunnelling is not possible against any collider here.

**Moving colliders bounce in their own frame.** A tier-5 bin sweeps at up to
`2π · 0.75 · 140 ≈ 660 u/s`, and reflecting in world space would let it pass
straight through the paper. Every collision resolves as `vRel = v − vCollider`,
reflect `vRel`, then `v = vRel′ + vCollider`.

**Ordering within a substep matters and is part of the contract:** resolve bin
and wall collisions *first*, then test capture. A shot that hits the rim has hit
the rim, even if its next position would be inside the cavity.

---

## 5. Input and the slingshot

Pointer Events throughout — one code path for mouse, touch and pen.
`touch-action: none` on the canvas.

### Aiming

| Step | Behaviour |
| --- | --- |
| pointerdown | **anywhere in the playfield** starts an aim and records `origin` |
| pointermove | `pull = origin - current` (inverted: drag back to fling forward) |
| pointerup | launch, if `\|pull\|` ≥ 12 px; otherwise cancel silently |
| pointercancel / leaving the window | cancel silently |

Pointer-down is anywhere rather than on the paper: the paper is 14 u across and
often drifting, and a phone thumb can't reliably find it. The launch always
originates at the bin regardless of where the drag started.

```
pullWorld = |pull| / scale
speed     = MAX_LAUNCH_SPEED * min(1, pullWorld / 200)
direction = normalize(pull)
```

Full power at 200 world units of pull — about 175 px on the phone, a
comfortable thumb travel on an 844 px screen.

### What the player sees while aiming

1. the paper **pulls back out of the bin**, offset along `-direction` by up to
   18 u — the literal slingshot tell
2. a thin charcoal band from the bin's cavity centre to the paper
3. **the preview**: 6 dots sampled every 0.055 s of simulated flight, radius
   4.5 → 1.5 u, alpha 0.55 → 0.06

### The preview contract

This is the difficulty lever, so it is specified tightly:

- it runs the **same integrator** as live flight (§4), never a closed-form arc
- it **advances the world clock** alongside the paper, so the dots account for
  where a drifting target and drifting obstacles will actually be
- it covers **0.33 s of simulated flight** and no more, at every level — it does
  not shrink as the game gets harder
- it **terminates at the first contact** with a wall, obstacle or bin, whatever
  time remains
- it shows **no bounces, ever**

The preview teaches the gesture in one drag and then gets out of the way. On a
level whose target is only reachable off a wall, the dots stop at the wall and
the rest is on the player.

---

## 6. Progression, scoring, lives

### Level

Starts at **1**, rises by 1 on every capture. Never falls. The end screen's
`level:` is the level the run ended on — the bin you were attempting.

### Difficulty tier

```
tier(level) = floor((level - 1) / 5)      // levels 1–5 → 0, 6–10 → 1, …
```

Every parameter is a clamped function of tier, so escalation is continuous,
pure, and testable:

| Parameter | Formula | Range |
| --- | --- | --- |
| bin width | `max(78, 130 - 11 * T)` | 130 → 78 u |
| vertical gap | `min(480, 300 + 38 * T)` | 300 → 480 u |
| drift amplitude | `T === 0 ? 0 : min(140, 25 + 25 * T)` | 0 → 140 u |
| drift frequency | `T === 0 ? 0 : min(0.75, 0.30 + 0.09 * T)` | 0 → 0.75 Hz |
| obstacle count | `T < 2 ? 0 : min(3, T - 1)` | 0 → 3 |
| obstacles drift | `T >= 4` | — |

What that feels like:

| Levels | Tier | What arrives |
| --- | --- | --- |
| 1–5 | 0 | wide static bins, clear shaft — you learn the sling |
| 6–10 | 1 | bins start drifting; you learn to lead the target |
| 11–15 | 2 | first obstacle — the wall bounce stops being optional |
| 16–20 | 3 | bins shrink, drift widens |
| 21–25 | 4 | obstacles drift too |
| 26+ | 5+ | every parameter at its clamp; only your hands improve |

### Target placement

The next target spawns `gap(T)` above the launcher rim, at a horizontal offset
drawn from a **seeded RNG** so a run is reproducible:

- `|dx|` between `0.15 * SHAFT_WIDTH` and `0.75 * SHAFT_WIDTH`
- sign random
- `xBase` clamped so `xBase ± amplitude` keeps the bin fully inside both walls
- obstacles placed between launcher and target, never overlapping either bin's
  full swing, and never fully sealing the gap: **at least one wall-bounce
  solution must exist at every level.**

### Score

Combo counts consecutive captures **including the one being scored**.

```
points(combo) = min(5, 1 + floor(combo / 5))
```

| Capture | combo | points |
| --- | --- | --- |
| 1st | 1 | +1 |
| 5th | 5 | +2 |
| 10th | 10 | +3 |
| 15th | 15 | +4 |
| 20th | 20 | +5 (cap) |
| 21st+ | 21+ | +5 |

Score is an integer throughout. A miss resets combo to 0; the score itself never
falls. `maxCombo` tracks the highest combo reached in the run.

### Lives

Start at **3**. A miss costs one life and resets the combo. A miss with **0
lives remaining ends the game** — four misses in total.

The launcher and the target are both unchanged by a miss: you throw again at the
same bin, from the same place. Level does not rise.

Miss is declared when any of:

- the paper's centre falls below the bottom of the frame
- flight time exceeds 8 s
- the paper is captured by *no* bin and comes to rest inside the frame (only
  possible resting on an obstacle) — declared after 1.0 s below 40 u/s

### Capture rule

With +y up, a capture occurs on a substep when **all** hold:

1. `prev.y > rimY` and `cur.y <= rimY` — crossing the rim plane downward
2. `binInnerLeft <= cur.x <= binInnerRight`
3. `v.y < 0`

and no rim/wall collision was resolved earlier in the same substep. On capture
the paper freezes, the `+N` popup fires, and the camera pan begins.

---

## 7. Screen and UI

### 7.1 The attract loop — the no-tutorial affordance

Runs only while awaiting the **first launch of the page load**, and never again
once one drag has completed. On a 2.6 s cycle:

```
0.0 – 0.9 s   paper eases back out of the bin along a fixed
              up-and-slightly-right vector, to 18 u
0.6 – 0.9 s   preview dots fade in at the top of the pull
0.9 – 1.05 s  paper snaps back to rest; dots fade out
1.05 – 2.6 s  still, paper breathing at ±1 u
```

It demonstrates the gesture and its consequence with no text. It does not
auto-play a shot — the player still makes the first move.

### 7.2 The overlay — three elements

All DOM, not canvas, so they're real text for assistive tech. All non-blocking
(`pointer-events: none`) except the source link.

| Corner | Element | Detail |
| --- | --- | --- |
| top left | lives | up to 3 filled charcoal dots, 8 px, 8 px apart, alpha 0.75. Losing one: the rightmost dot scales to 0 and fades over 260 ms while the row shakes 3 px. At 0 lives the corner is empty — the wordless "next one ends it". |
| top right | score | integer, tabular figures, alpha 0.75. A gain animates the digits up by 2 px and back over 180 ms. |
| bottom left | title | `<h1>paper jump</h1>`, lowercase, 13 px, alpha 0.45 |

Safe areas respected with `env(safe-area-inset-*)`; the phone notch never sits
over the lives or the score.

### 7.3 The score popup

Canvas, world-anchored so it rides the camera pan. `+N` rises 60 u from the bin
rim over 820 ms, alpha 1 → 0, scale 0.9 → 1.15 in the first 140 ms.

### 7.4 The end screen

The scene freezes and dims to 55%. Four lines, centred, monospace figures:

```
level: 12
score: 31/48
max combo: 7

click to restart
```

`max score` is **the best score across previous runs on this device**, held in
`localStorage` under `paper-jump:best`, written at game over. On a first-ever
run the two numbers are equal, which reads correctly as "this is the bar now".

> **Assumption to confirm.** "score: `<final>`/`<max>`" is read here as
> score-against-personal-best. The alternative reading — the theoretical maximum
> for the levels reached — has no fixed value in an endless game, so best-ever
> is the only coherent one. Say if you meant something else.

Any pointerdown restarts: level 1, score 0, combo 0, lives 3, fresh RNG seed.
The attract loop does **not** return.

### 7.5 The navigation landmark

`spec/invariants.test.ts` requires a `<nav>` on every page, and a one-page game
has nothing to navigate to. Rather than ship a hollow landmark, the bottom-left
becomes a two-line signature:

```html
<h1 class="title">paper jump</h1>
<nav aria-label="Primary"><a href="…repo URL…">source</a></nav>
```

`source` renders at 10 px, alpha 0.28, directly under the title — reading as a
credit line rather than a fourth piece of chrome. It is the one element on
screen that takes a pointer.

> **Flagging this against the brief for three UI elements.** It's a fourth DOM
> node. It earns its place by making the landmark honest and by pointing a crit
> audience at the source. Say the word and it becomes a visually-hidden skip
> link instead.

---

## 8. Art direction

Minimum-style: flat, no gradients, no shadows, no textures, one committed
palette (not theme-reactive — it's a game, not a document).

| Token | Value | Use |
| --- | --- | --- |
| `--wall` | `#f2efe8` | the wall, full bleed |
| `--shaft` | `#faf8f4` | inside the shaft |
| `--ink` | `#2a2925` | bins, obstacles, paper outline, all text |
| `--paper` | `#fffdf8` | the ball's fill |
| `--accent` | `#d9553f` | the `+N` popup only |

Line weight is 2 u everywhere. The accent appears exactly once — on the score
popup — so the eye is pulled to the reward and nothing else.

- **mesh bin**: 45° cross-hatch at 9 u spacing, clipped to the basket
  silhouette, `--ink` at alpha 0.5, with a solid 2 u rim
- **wall**: flat `--wall`, plus 1 u horizontal ticks every 240 u at alpha 0.06,
  and a 2 u `--ink` line at each inner face
- **obstacles**: solid `--ink` bars, no detail
- **paper**: `--paper` fill, 2 u `--ink` outline, 3 crease strokes at alpha 0.3

`prefers-reduced-motion: reduce` shortens the camera pan to 120 ms, drops the
paper's rotation and the score-popup scale, and holds the attract loop's pulled
pose statically instead of cycling.

---

## 9. Build

Vite + TypeScript, single page, no runtime dependencies. Canvas 2D on a
`devicePixelRatio`-scaled backing store; the overlay stays DOM.

Modules, split so the rules are pure and the canvas is thin:

| Module | Contains | Pure? |
| --- | --- | --- |
| `src/rng.ts` | mulberry32, seeded | ✅ |
| `src/scoring.ts` | `points(combo)` | ✅ |
| `src/difficulty.ts` | `tier(level)`, `params(level)` | ✅ |
| `src/physics.ts` | `step()`, `simulate()`, collision resolution | ✅ |
| `src/capture.ts` | `didCapture(prev, cur, bin)` | ✅ |
| `src/level.ts` | target and obstacle placement from a seed | ✅ |
| `src/game.ts` | the reducer: `reduce(state, event) → state` | ✅ |
| `src/render.ts` | canvas drawing | ❌ |
| `src/input.ts` | pointer events → events | ❌ |
| `main.ts` | wiring, RAF loop, overlay | ❌ |

Everything that constitutes a *rule* is a pure function taking plain data. The
canvas is a projection of state and holds none of it.

Also to update, per `CLAUDE.md`: `public/card.png` (1200×630) and the
`description` meta in `index.html`.

---

## 10. What gets tested

`spec/paper-jump.test.ts`, alongside the shipped invariants.

**The focused rule test the published spec asks for** is the capture-and-score
rule — the one rule the whole game turns on:

1. a paper crossing the rim plane downward, inside the inner width, is captured;
   the same crossing with `v.y > 0` is not
2. a paper crossing the rim plane outside the inner width is not captured
3. a substep that resolved a rim collision cannot also capture

And the rules that decide when play ends:

4. `points(combo)` — the table in §6 asserted exactly, including the cap at
   combo 20 and beyond
5. a miss decrements lives and zeroes the combo; the score never falls
6. the **fourth** miss ends the game and the third does not
7. a capture raises the level by 1; a miss does not
8. `tier(level)` boundaries at 5/6, 10/11, and `params()` clamps at high tiers
9. physics determinism: the same seed and the same launch produce the same
   trajectory, at any frame rate
10. the preview never crosses a wall — `simulate()` truncated at first contact
    returns no point beyond either wall plane

These test the *contract*, not the implementation: they'd survive swapping the
renderer or the integrator.

Out of scope for automated tests, and left to the crit: whether the bounce feels
fair, whether the attract loop actually teaches the drag, whether five minutes
holds. The brief settles those with four people's hands on the keyboard.

---

## 11. Accessibility and robustness

The HD band asks for a prototype that holds up under use it wasn't designed
for:

- **keyboard**: arrow keys aim (5° per press, 4° with shift), space charges
  power on a repeating 1.2 s triangle wave and releases on keyup. Enter restarts
  at game over. Not the primary control, but the game is not unplayable without
  a pointer.
- **resize mid-interaction**: covered in §2 — mid-drag and mid-flight both
  survive.
- **slow connection**: no runtime dependencies and no fonts to fetch; the game
  is one HTML file, one CSS file and one JS bundle. Nothing blocks the first
  frame.
- **tab visibility**: `visibilitychange` pauses the accumulator so a
  backgrounded tab doesn't fast-forward a flight on return.
- **reduced motion**: covered in §8.

---

## 12. Open questions

1. **`max score` on the end screen** — read as personal best in `localStorage`
   (§7.4). Confirm.
2. **the `source` link** — a fourth DOM element, added to make the required
   `<nav>` landmark honest (§7.5). Confirm, or it becomes a hidden skip link.
3. **"click to restart" on touch** — kept verbatim as specified. It could read
   `tap to restart` on a coarse pointer; it is an end-of-run prompt rather than
   a tutorial either way, so the brief's no-instructions rule is not in play.
4. **audio** — not specified and currently out of scope. A single soft thud on
   wall contact and a rim-drop tick would carry a lot of feel for very little
   code, if wanted.
