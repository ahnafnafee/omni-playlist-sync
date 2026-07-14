import { interpolate, spring } from "remotion";

/** Opacity that eases in at the start and out at the end of a sequence. */
export const fadeInOut = (
  frame: number,
  dur: number,
  inF = 12,
  outF = 12,
): number =>
  interpolate(
    frame,
    [0, inF, dur - outF, dur],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

/** A soft spring preset used for entrance moves. */
export const enter = (
  frame: number,
  fps: number,
  delay = 0,
  config?: Parameters<typeof spring>[0]["config"],
): number =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.9, stiffness: 120, ...config },
    durationInFrames: 40,
  });

/** Map a 0..1 progress onto a translate distance. */
export const rise = (p: number, distance = 28): number => (1 - p) * distance;

/** Continuous slow drift (parallax) as a sine of the absolute frame. */
export const drift = (
  absFrame: number,
  amplitude: number,
  periodFrames: number,
  phase = 0,
): number => Math.sin((absFrame / periodFrames) * Math.PI * 2 + phase) * amplitude;
