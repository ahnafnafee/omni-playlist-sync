import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Poppins — bold, geometric, matches the rounded wordmark vibe.
const poppins = loadPoppins("normal", {
  weights: ["400", "500", "600", "700", "800"],
});

// JetBrains Mono — for the small uppercase eyebrow labels, echoing the app's
// monospaced UI captions ("GOOD EVENING, MAYA", "DECK A · SOURCE").
const mono = loadMono("normal", { weights: ["400", "500", "700"] });

export const FONT = poppins.fontFamily;
export const FONT_MONO = mono.fontFamily;
