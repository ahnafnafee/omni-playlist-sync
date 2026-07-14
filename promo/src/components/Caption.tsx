import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Eyebrow } from "./Eyebrow";
import { FONT } from "../fonts";
import { COLORS } from "../theme";
import { enter, rise } from "../util/anim";

// Eyebrow + headline + optional subtitle, revealed with a small stagger.
export const Caption: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  align?: "left" | "center";
  titleSize?: number;
  maxWidth?: number;
}> = ({
  eyebrow,
  title,
  sub,
  align = "left",
  titleSize = 68,
  maxWidth = 560,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p0 = enter(frame, fps, 0);
  const p1 = enter(frame, fps, 6);
  const p2 = enter(frame, fps, 12);
  const centered = align === "center";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
        alignItems: centered ? "center" : "flex-start",
        textAlign: centered ? "center" : "left",
        maxWidth,
      }}
    >
      <div style={{ opacity: p0, transform: `translateY(${rise(p0, 16)}px)` }}>
        <Eyebrow align={align}>{eyebrow}</Eyebrow>
      </div>
      <div
        style={{
          opacity: p1,
          transform: `translateY(${rise(p1)}px)`,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: titleSize,
          lineHeight: 1.05,
          color: COLORS.text,
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            opacity: p2,
            transform: `translateY(${rise(p2)}px)`,
            fontFamily: FONT,
            fontWeight: 400,
            fontSize: 25,
            lineHeight: 1.42,
            color: COLORS.textMuted,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};
