import { createContext, useContext } from "react";

// "Lite" mode freezes the always-on background motion and drops grain so that
// held frames become near-identical — which shrinks the derived GIF massively.
// The full-quality MP4 renders with lite=false (the default).
export const LiteContext = createContext(false);
export const useLite = (): boolean => useContext(LiteContext);
