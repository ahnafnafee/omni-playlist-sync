import React from "react";
import { FONT_MONO } from "../fonts";
import { COLORS } from "../theme";

// Small uppercase monospaced label with a leading tick, matching the app UI.
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  color?: string;
  align?: "left" | "center";
  size?: number;
}> = ({ children, color = COLORS.orange, align = "left", size = 20 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      justifyContent: align === "center" ? "center" : "flex-start",
    }}
  >
    <span style={{ width: 26, height: 2, background: color, opacity: 0.9 }} />
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: size,
        letterSpacing: 5,
        textTransform: "uppercase",
        color,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  </div>
);
