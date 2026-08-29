// The sound of a paper ball, synthesised. No asset files: nothing to load,
// nothing to license, nothing that can fail on a slow connection, and no mute
// button needed --- which matters, because a mute button would be a fourth
// thing on an overlay the design allows three.
//
// The impacts are NOISE, not oscillators. A crumpled sheet hitting wire mesh
// is broadband rustle with a little grain on top; a tone gets you a doorbell.
// Only the rewards --- which are cues rather than physical events --- are
// pitched.
import type { Sound, SoundKind } from "./game.ts";

type Layer =
  | {
      readonly type: "tone";
      readonly from: number;
      readonly to: number;
      readonly seconds: number;
      readonly wave: OscillatorType;
      readonly gain: number;
      readonly delay?: number;
    }
  | {
      readonly type: "noise";
      /** Bandpass centre, swept from the first value to the second. */
      readonly from: number;
      readonly to: number;
      readonly q: number;
      readonly seconds: number;
      readonly gain: number;
      readonly delay?: number;
    };

type Voice = {
  readonly layers: readonly Layer[];
  /** Shortest gap between two of these, so a bouncing paper doesn't machine-gun. */
  readonly cooldown: number;
};

const VOICES: Record<SoundKind, Voice> = {
  // paper on a painted wall: dull, broad, gone almost at once
  wall: {
    layers: [{ type: "noise", from: 430, to: 240, q: 0.8, seconds: 0.09, gain: 0.13 }],
    cooldown: 0.05,
  },
  // paper on wire mesh: a bright grainy rustle, plus a little wire on top
  bin: {
    layers: [
      { type: "noise", from: 2300, to: 1150, q: 1, seconds: 0.15, gain: 0.17 },
      { type: "noise", from: 5400, to: 4200, q: 2.6, seconds: 0.05, gain: 0.05 },
    ],
    cooldown: 0.035,
  },
  obstacle: {
    layers: [{ type: "noise", from: 950, to: 520, q: 1.1, seconds: 0.07, gain: 0.09 }],
    cooldown: 0.05,
  },
  // the landing itself, then the cue that it counted
  score: {
    layers: [
      { type: "noise", from: 2100, to: 950, q: 1, seconds: 0.13, gain: 0.13 },
      { type: "tone", from: 520, to: 1040, seconds: 0.19, wave: "sine", gain: 0.13, delay: 0.02 },
    ],
    cooldown: 0.1,
  },
  extra: {
    layers: [{ type: "tone", from: 700, to: 1400, seconds: 0.34, wave: "triangle", gain: 0.15 }],
    cooldown: 0.3,
  },
  life: {
    layers: [{ type: "tone", from: 420, to: 150, seconds: 0.26, wave: "sine", gain: 0.14 }],
    cooldown: 0.2,
  },
  over: {
    layers: [{ type: "tone", from: 300, to: 70, seconds: 0.7, wave: "sine", gain: 0.18 }],
    cooldown: 0.5,
  },
};

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
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

/** Two seconds of white noise, made once. Every impact reads a random slice of
 *  it, so no two bounces sound identical --- which is most of what stops a
 *  synthesised impact sounding synthesised. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  const frames = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

/** A short attack and an exponential tail: a linear fade reads as a click. */
function envelope(ctx: AudioContext, at: number, seconds: number, peak: number): GainNode {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  return amp;
}

export function playSound({ kind, intensity }: Sound): void {
  if (!context || context.state !== "running") return;
  const ctx = context;
  const voice = VOICES[kind];
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(kind) ?? -Infinity) < voice.cooldown) return;
  lastPlayed.set(kind, now);

  for (const layer of voice.layers) {
    const at = now + (layer.delay ?? 0);
    const amp = envelope(ctx, at, layer.seconds, layer.gain * intensity);
    amp.connect(ctx.destination);

    if (layer.type === "tone") {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.from, at);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.to), at + layer.seconds);
      osc.connect(amp);
      osc.start(at);
      osc.stop(at + layer.seconds + 0.02);
    } else {
      const buffer = noiseBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // a slightly different slice, and pitch, every time
      source.playbackRate.value = 0.9 + Math.random() * 0.2;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = layer.q;
      band.frequency.setValueAtTime(layer.from, at);
      band.frequency.exponentialRampToValueAtTime(Math.max(40, layer.to), at + layer.seconds);
      source.connect(band).connect(amp);
      source.start(at, Math.random() * 1.5, layer.seconds + 0.05);
      source.stop(at + layer.seconds + 0.05);
    }
  }
}
