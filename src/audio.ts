// Four blips, synthesised. No asset files: nothing to load, nothing to
// license, nothing that can fail on a slow connection, and no mute button
// needed --- which matters, because a mute button would be a fourth thing on
// an overlay the design allows three.
import type { Sound, SoundKind } from "./game.ts";

type Voice = {
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly type: OscillatorType;
  readonly gain: number;
  /** Shortest gap between two of these, so a bouncing paper doesn't machine-gun. */
  readonly cooldown: number;
};

const VOICES: Record<SoundKind, Voice> = {
  wall: { from: 165, to: 95, seconds: 0.07, type: "sine", gain: 0.13, cooldown: 0.05 },
  bin: { from: 880, to: 620, seconds: 0.045, type: "triangle", gain: 0.09, cooldown: 0.04 },
  obstacle: { from: 270, to: 170, seconds: 0.06, type: "square", gain: 0.05, cooldown: 0.05 },
  score: { from: 520, to: 1050, seconds: 0.19, type: "sine", gain: 0.16, cooldown: 0.1 },
  life: { from: 420, to: 150, seconds: 0.26, type: "sine", gain: 0.14, cooldown: 0.2 },
  over: { from: 300, to: 70, seconds: 0.7, type: "sine", gain: 0.18, cooldown: 0.5 },
};

let context: AudioContext | null = null;
let failed = false;
const lastPlayed = new Map<SoundKind, number>();

/**
 * Browsers refuse to start audio before a gesture, so this is called from the
 * first pointerdown. Called again afterwards it just resumes a context the
 * browser suspended.
 */
export function unlockAudio(): void {
  if (failed) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    // no Web Audio, or blocked outright: the game is fine without it
    failed = true;
    context = null;
  }
}

export function playSound({ kind, intensity }: Sound): void {
  if (!context || context.state !== "running") return;
  const voice = VOICES[kind];
  const now = context.currentTime;
  if (now - (lastPlayed.get(kind) ?? -Infinity) < voice.cooldown) return;
  lastPlayed.set(kind, now);

  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = voice.type;
  osc.frequency.setValueAtTime(voice.from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.to), now + voice.seconds);

  // A short attack and an exponential tail: a linear fade reads as a click.
  const peak = voice.gain * intensity;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + voice.seconds);

  osc.connect(amp).connect(context.destination);
  osc.start(now);
  osc.stop(now + voice.seconds + 0.02);
}
