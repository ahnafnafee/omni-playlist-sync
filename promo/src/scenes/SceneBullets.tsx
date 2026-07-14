import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Eyebrow } from "../components/Eyebrow";
import { COLORS } from "../theme";
import { FONT } from "../fonts";
import { drift, enter, fadeInOut, rise } from "../util/anim";
import { useLite } from "../lite";

const BULLETS = [
  {
    title: "ISRC-accurate matching",
    sub: "The same recording, matched right across every service",
  },
  {
    title: "Adds and removals, mirrored",
    sub: "Curate in one place — every service follows, both ways",
  },
  {
    title: "Self-hosted · Open source",
    sub: "Runs in your browser. Your data never leaves your machine.",
  },
];

const Check: React.FC = () => (
  <div
    style={{
      width: 46,
      height: 46,
      borderRadius: 14,
      flex: "0 0 auto",
      background: "linear-gradient(150deg, #FF7A2E, #F2601A)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 8px 22px rgba(242,96,26,0.4)",
    }}
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="#0E0E0E"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

const GhostCard: React.FC<{
  src: string;
  aspect: number;
  left: number;
  rotate: number;
  frame: number;
  phase: number;
  lite: boolean;
}> = ({ src, aspect, left, rotate, frame, phase, lite }) => {
  const w = 520;
  return (
    <div
      style={{
        position: "absolute",
        top: 240 + (lite ? 0 : drift(frame, 16, 300, phase)),
        left,
        width: w,
        height: w * aspect,
        transform: `rotate(${rotate}deg)`,
        borderRadius: 18,
        overflow: "hidden",
        opacity: 0.1,
        filter: "blur(2px)",
        border: `1px solid ${COLORS.panelBorder}`,
      }}
    >
      <Img src={staticFile(src)} style={{ width: w, height: "auto" }} />
    </div>
  );
};

export const SceneBullets: React.FC<{ dur: number }> = ({ dur }) => {
  const lite = useLite();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pEye = enter(frame, fps, 0);

  return (
    <AbsoluteFill style={{ opacity: fadeInOut(frame, dur) }}>
      <GhostCard
        src="shots/accounts.png"
        aspect={0.70313}
        left={-120}
        rotate={-8}
        frame={frame}
        phase={0}
        lite={lite}
      />
      <GhostCard
        src="shots/playlists.png"
        aspect={0.8289}
        left={1520}
        rotate={7}
        frame={frame}
        phase={2}
        lite={lite}
      />

      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 30,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              opacity: pEye,
              transform: `translateY(${rise(pEye, 14)}px)`,
              alignSelf: "center",
              marginBottom: 6,
            }}
          >
            <Eyebrow align="center">Built to get matches right</Eyebrow>
          </div>

          {BULLETS.map((b, i) => {
            const p = enter(frame, fps, 10 + i * 9);
            return (
              <div
                key={b.title}
                style={{
                  opacity: p,
                  transform: `translateX(${rise(p, 34)}px)`,
                  display: "flex",
                  gap: 22,
                  alignItems: "center",
                }}
              >
                <Check />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: 42,
                      letterSpacing: -0.6,
                      color: COLORS.text,
                    }}
                  >
                    {b.title}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT,
                      fontWeight: 400,
                      fontSize: 22,
                      color: COLORS.textMuted,
                    }}
                  >
                    {b.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
