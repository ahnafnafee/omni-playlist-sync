import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Caption } from "./Caption";
import { ScreenFrame } from "./ScreenFrame";
import { COLORS } from "../theme";
import { drift, enter, fadeInOut } from "../util/anim";
import { useLite } from "../lite";

// A caption paired with a framed screenshot that springs in from one side,
// with a subtle perspective tilt, parallax drift, and optional vertical pan.
export const Showcase: React.FC<{
  dur: number;
  eyebrow: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  src: string;
  imgAspect: number;
  label: string;
  side?: "right" | "left";
  panFrom?: number;
  panTo?: number;
}> = ({
  dur,
  eyebrow,
  title,
  sub,
  src,
  imgAspect,
  label,
  side = "right",
  panFrom = 0,
  panTo = 0,
}) => {
  const lite = useLite();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const p = enter(frame, fps, 4, { stiffness: 70, damping: 18, mass: 1.1 });
  const dir = side === "right" ? 1 : -1;
  const slideX = (1 - p) * 130 * dir;
  const tilt = interpolate(p, [0, 1], [12 * dir, 6 * dir]);
  const driftY = lite ? 0 : drift(frame, 10, 240);
  const pan = interpolate(frame, [0, dur], [panFrom, panTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const frameW = 960;
  const vpH = 636;

  const screen = (
    <div
      style={{
        position: "relative",
        transform: `translateX(${slideX}px) translateY(${driftY}px) perspective(1800px) rotateY(${-tilt}deg)`,
        opacity: p,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -40,
          borderRadius: 40,
          background:
            "radial-gradient(closest-side, rgba(242,96,26,0.28), rgba(242,96,26,0) 70%)",
          filter: "blur(20px)",
        }}
      />
      <ScreenFrame
        src={src}
        imgAspect={imgAspect}
        width={frameW}
        viewportHeight={vpH}
        pan={pan}
        label={label}
      />
    </div>
  );

  const caption = (
    <div style={{ flex: "0 0 auto", width: 560 }}>
      <Caption eyebrow={eyebrow} title={title} sub={sub} />
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        opacity: fadeInOut(frame, dur),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 100px",
        gap: 40,
      }}
    >
      {side === "right" ? (
        <>
          {caption}
          {screen}
        </>
      ) : (
        <>
          {screen}
          {caption}
        </>
      )}
    </AbsoluteFill>
  );
};
