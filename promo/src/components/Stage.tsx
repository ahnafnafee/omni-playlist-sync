import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS, WIDTH, HEIGHT } from "../theme";
import { drift } from "../util/anim";
import { useLite } from "../lite";

// Persistent background shared by every scene: base gradient, two slowly
// drifting tangerine glows, a masked dot grid, static grain, and a vignette.
export const Stage: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const lite = useLite();
  const frame = useCurrentFrame();
  const gx = lite ? 50 : 50 + drift(frame, 6, 480, 0);
  const gy = lite ? 40 : 40 + drift(frame, 5, 620, 1.3);
  const gx2 = lite ? 78 : 78 + drift(frame, 7, 540, 2.1);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bgDeep} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(700px 540px at ${gx}% ${gy}%, rgba(242,96,26,0.20), rgba(242,96,26,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(520px 420px at ${gx2}% 90%, rgba(194,65,12,0.16), rgba(0,0,0,0) 72%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage:
            "radial-gradient(125% 125% at 50% 42%, #000 28%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(125% 125% at 50% 42%, #000 28%, transparent 80%)",
        }}
      />
      {!lite && (
        <AbsoluteFill style={{ opacity: 0.045, mixBlendMode: "overlay" }}>
          <svg width={WIDTH} height={HEIGHT}>
            <filter id="omni-grain">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                seed="7"
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#omni-grain)" />
          </svg>
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{ boxShadow: "inset 0 0 340px 90px rgba(0,0,0,0.62)" }}
      />
      {children}
    </AbsoluteFill>
  );
};
