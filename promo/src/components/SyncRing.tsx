import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

// Two-arc rotating ring that echoes the sync-arrows in the logo mark.
export const SyncRing: React.FC<{
  size: number;
  stroke?: number;
  color?: string;
  spinFrames?: number;
  drawIn?: number;
  opacity?: number;
}> = ({
  size,
  stroke = 4,
  color = COLORS.orange,
  spinFrames = 260,
  drawIn = 30,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const rot = (frame / spinFrames) * 360;
  const draw = interpolate(frame, [0, drawIn], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const segFull = c / 2 - 18;
  const segLen = Math.max(0.001, segFull * draw);
  const arc = (offset: number) => (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeDasharray={`${segLen} ${c - segLen}`}
      strokeDashoffset={offset}
    />
  );
  return (
    <svg
      width={size}
      height={size}
      style={{ opacity, transform: `rotate(${rot}deg)` }}
    >
      {arc(0)}
      {arc(-c / 2)}
    </svg>
  );
};
