import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Eyebrow } from "../components/Eyebrow";
import { ServiceRow } from "../components/ServiceRow";
import { COLORS } from "../theme";
import { FONT } from "../fonts";
import { enter, fadeInOut, rise } from "../util/anim";

export const SceneTagline: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p0 = enter(frame, fps, 0);
  const pA = enter(frame, fps, 8);
  const pB = enter(frame, fps, 18);
  const pNote = enter(frame, fps, 40);

  return (
    <AbsoluteFill
      style={{
        opacity: fadeInOut(frame, dur),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
          textAlign: "center",
        }}
      >
        <div style={{ opacity: p0, transform: `translateY(${rise(p0, 16)}px)` }}>
          <Eyebrow align="center">One library · Every service</Eyebrow>
        </div>

        <div
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 88,
            letterSpacing: -2,
            lineHeight: 1.06,
            color: COLORS.text,
          }}
        >
          <div style={{ opacity: pA, transform: `translateY(${rise(pA, 26)}px)` }}>
            Your playlists. Everywhere.
          </div>
          <div style={{ opacity: pB, transform: `translateY(${rise(pB, 26)}px)` }}>
            Always <span style={{ color: COLORS.orange }}>in sync.</span>
          </div>
        </div>

        <ServiceRow delay={26} />

        <div
          style={{
            opacity: pNote,
            fontFamily: FONT,
            fontWeight: 400,
            fontSize: 22,
            color: COLORS.textMuted,
          }}
        >
          + a local <span style={{ color: COLORS.jellyfin }}>Jellyfin</span> download
          mirror
        </div>
      </div>
    </AbsoluteFill>
  );
};
