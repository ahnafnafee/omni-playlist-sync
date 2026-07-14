import { Config } from "@remotion/cli/config";

// Screenshots are photographic-ish; PNG frames keep captions crisp for the
// intermediate MP4 that the GIF is derived from.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
