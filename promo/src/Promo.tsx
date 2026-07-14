import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { LiteContext } from "./lite";
import { Stage } from "./components/Stage";
import { SceneLogo } from "./scenes/SceneLogo";
import { SceneTagline } from "./scenes/SceneTagline";
import { SceneDashboard } from "./scenes/SceneDashboard";
import { SceneWizard } from "./scenes/SceneWizard";
import { SceneTransfers } from "./scenes/SceneTransfers";
import { SceneBullets } from "./scenes/SceneBullets";
import { SceneOutro } from "./scenes/SceneOutro";
import { scene } from "./theme";

// Each scene owns its in/out fade; sequences overlap by XF frames (see theme)
// so the fades crossfade over the persistent Stage background.
const At: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const s = scene(id);
  return (
    <Sequence from={s.from} durationInFrames={s.dur} name={id} layout="none">
      {children}
    </Sequence>
  );
};

export const Promo: React.FC<{ lite?: boolean }> = ({ lite = false }) => {
  return (
    <LiteContext.Provider value={lite}>
      <AbsoluteFill>
        <Stage />
      <At id="logo">
        <SceneLogo dur={scene("logo").dur} />
      </At>
      <At id="tagline">
        <SceneTagline dur={scene("tagline").dur} />
      </At>
      <At id="dashboard">
        <SceneDashboard dur={scene("dashboard").dur} />
      </At>
      <At id="wizard">
        <SceneWizard dur={scene("wizard").dur} />
      </At>
      <At id="transfers">
        <SceneTransfers dur={scene("transfers").dur} />
      </At>
      <At id="bullets">
        <SceneBullets dur={scene("bullets").dur} />
      </At>
      <At id="outro">
        <SceneOutro dur={scene("outro").dur} />
      </At>
      </AbsoluteFill>
    </LiteContext.Provider>
  );
};
