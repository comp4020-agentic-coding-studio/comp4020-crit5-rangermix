// Every tunable in one place, straight from spec/paper-jump.md. World units
// throughout: +x right, +y UP, origin at the shaft's bottom-left at level 1.
//
// Nothing here is a screen measurement. The projection lives in render.ts, so
// a bounce means exactly the same thing at 1920x1080 as it does at 390x844.

// ------------------------------------------------------------- the playfield

/** Inner wall face to inner wall face. */
export const SHAFT_WIDTH = 420;

/** The vertical span difficulty is defined against. The *visible* height
 *  varies a little with the viewport's aspect; difficulty never does. */
export const NOMINAL_HEIGHT = 960;

/** How much of the viewport width the shaft may occupy before the fit becomes
 *  width-limited instead of height-limited. */
export const SHAFT_VIEWPORT_FRACTION = 0.94;

/** Faint horizontal marks on the wall, the only thing that makes the climb
 *  read as a climb. */
export const WALL_TICK_SPACING = 240;

// ----------------------------------------------------------------- physics

export const GRAVITY = 1500;
export const DAMPING = 0.2;
export const SUBSTEP = 1 / 240;
export const MAX_FLIGHT_TIME = 8;

export const PAPER_RADIUS = 14;

export const WALL_RESTITUTION = 0.55;
/** Fraction of tangential speed a wall keeps: grazing shots slide, they
 *  don't stall. */
export const WALL_FRICTION = 0.92;
export const BIN_RESTITUTION = 0.4;
export const OBSTACLE_RESTITUTION = 0.6;

/** A paper this slow for this long, still on screen, has come to rest. */
export const REST_SPEED = 40;
export const REST_TIME = 1;

// ------------------------------------------------------------- the slingshot

export const MAX_LAUNCH_SPEED = 1600;
/** Pull distance in WORLD units at which the sling is at full power. */
export const FULL_POWER_PULL = 200;
/** Below this, in SCREEN px, a pointerup was a tap and not a shot. */
export const MIN_PULL_PX = 12;
/** How far the paper visibly draws back out of the bin at full power. */
export const MAX_DRAW_BACK = 18;

/** The preview covers this much simulated flight and no more, at every level.
 *  It is the game's difficulty lever: aiming is given, predicting the bounce
 *  is earned. See spec/paper-jump.md §5. */
export const PREVIEW_TIME = 0.33;
export const PREVIEW_INTERVAL = 0.055;

// -------------------------------------------------------------------- bins

export const BIN_THICKNESS = 6;
export const BIN_HEIGHT_RATIO = 0.62;
export const OBSTACLE_HEIGHT = 14;

// ---------------------------------------------------------------- the rules

export const STARTING_LIVES = 3;
/** Consecutive captures per extra point. */
export const COMBO_STEP = 5;
export const MAX_POINTS = 5;
/** Levels per difficulty tier. */
export const TIER_SIZE = 5;

// ------------------------------------------------------------ presentation

/** Where the launcher's rim sits, as a fraction of NOMINAL_HEIGHT above the
 *  bottom of the frame. */
export const CAMERA_ANCHOR = 0.22;
export const CAMERA_PAN = 0.52;
export const CAMERA_PAN_REDUCED = 0.12;

export const POPUP_TIME = 0.82;
export const POPUP_RISE = 60;

export const ATTRACT_CYCLE = 2.6;

export const BEST_KEY = "paper-jump:best";

/** The most simulated time one frame may catch up on. A backgrounded tab or a
 *  stalled main thread must not fast-forward a flight, and must not spiral. */
export const MAX_FRAME = 0.25;

/** How much of its spin the paper keeps through a bounce. Cosmetic. */
export const SPIN_RETENTION = 0.7;
