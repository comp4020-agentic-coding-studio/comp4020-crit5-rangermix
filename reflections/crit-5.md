# Crit 5 — paper jump

## What was the breakthrough that moved the work forward?

Building a measuring instrument instead of tuning by feel. A test asserting
every generated level was reachable failed on level 17, and my instinct was to
change numbers until it went green. What actually moved the work was stopping
to ask what "too hard" even means.

My first attempt at answering measured the wrong thing entirely. Counting the
fraction of random launches that score sounds obviously right, and it says a
bin sitting directly overhead is hard — when in fact that is the easiest shot
in the game for a person, because you just throw it up. Switching to aim
tolerance, the widest span of launch angles that still lands the shot, gave me
a number in degrees I could hold directly against how precisely a thumb can
aim. Two of the changes that came out of it — fewer obstacles, and much calmer
obstacle drift — I would not have found by playing for an hour, because they
only show up as a curve across tiers.

## What did this work change about who I want to be as a software developer?

I want to be someone who notices when they are optimising a proxy. The density
metric was reasonable, cheap to compute, and quietly wrong, and no test output
would ever have told me so — it would just have produced a game that felt bad
for reasons I could not name.

I also want to hold on to the distinction this week made concrete. A test
proved the fourth miss ends the run. Only playing showed me the preview was
drawing two dots. Both matter, and they catch completely different things.
