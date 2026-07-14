import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

// The equalizer motif from the logo mark, as bouncing audio bars.
export const EqualizerBars: React.FC<{
  count?: number;
  barWidth?: number;
  height?: number;
  gap?: number;
  color?: string;
  intro?: number;
}> = ({
  count = 5,
  barWidth = 12,
  height = 64,
  gap = 8,
  color = COLORS.orange,
  intro = 16,
}) => {
  const frame = useCurrentFrame();
  const grow = Math.min(1, frame / intro);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height }}>
      {new Array(count).fill(0).map((_, i) => {
        const phase = i * 0.7;
        const base = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(frame / 6 + phase));
        const h = Math.max(barWidth, height * base * grow);
        return (
          <div
            key={i}
            style={{
              width: barWidth,
              height: h,
              borderRadius: barWidth / 2,
              background: `linear-gradient(180deg, ${COLORS.orangeBright}, ${color})`,
            }}
          />
        );
      })}
    </div>
  );
};
