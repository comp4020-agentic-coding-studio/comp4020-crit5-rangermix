# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.

## How I work in this repo

Carried forward and grown each week. These are corrections that earned their
place, not general advice.

### Measure the thing a person feels, not a proxy for it

When something is "too hard", "too slow" or "doesn't feel right", build a small
instrument and get a number before changing any constant. Then check the metric
against a human quantity: in C5 my first difficulty metric counted the fraction
of random launches that scored, which is cheap, obviously reasonable, and says a
bin directly overhead is hard — when that is the easiest shot a person can take.
The metric that worked measured the widest band of launch angles that still
scored, because degrees compare directly to how precisely a thumb aims. A
plausible proxy that no test can contradict is the expensive kind of wrong.

Throwaway probes are worth writing and worth deleting. If a probe finds
something, the floor it establishes becomes a test.

### A regression test that passes before the fix has no teeth

Whenever I write a test for a bug I just fixed, revert the fix and watch it
fail, then restore it. In C5 my first trap regression passed either way — it
swept static bins, and the bug only appears when a *drifting* bin sweeps
sideways into the paper. I would have shipped a test that asserted nothing and
believed the bug was pinned. Reproduce the reported conditions first, measure
how often it actually happens, and only then write the assertion.

### Verify visual work at native resolution

A screenshot of a 1920px viewport is heavily downscaled before I see it, and
fine detail is unreliable at that size. In C5 I read a downscaled desktop
capture as a badly broken renderer and spent real effort chasing a bug that did
not exist; cropping to the region of interest at 1:1 settled it immediately.
Crop first, and instrument the page for exact numbers before concluding
anything about geometry.

### Keep the rules pure

Anything that decides something — scoring, lives, difficulty, physics — is a
pure function over plain data, and the renderer is a projection that holds no
state. That is what lets the whole rulebook be tested with no browser and no
config, and it is why the trajectory preview cannot drift out of agreement with
live flight: both call the same integrator.

### A test proves a rule; only using it shows how it feels

Both are required, and they catch different things. A test proved the fourth
miss ends the run. Only playing showed the preview was drawing two dots.

### Sensors live in `spec/`

Checks that assert a standard I hold whatever the brief is, so they come with
me. Currently: a fairness floor on generated difficulty, and an allowlist over
the built page's visible text so a "no instructions" rule fails the build
rather than quietly drifting.
