import { useState } from "react";

// Early-90s CRT monitors around the reply. One is picked at random on each page load;
// ?crt=a|b|c|d in the URL forces one (handy for checking a design).
// Cases are CSS so they stretch to any box size; only the bottom controls differ per model.

const MODELS = {
  // beige VGA monitor: badge, vents, two knobs, power rocker
  a: () => (
    <>
      <span className="crt-badge">VGA COLOR</span>
      <span className="crt-vents crt-extra" />
      <span className="crt-spacer" />
      <span className="crt-knob" />
      <span className="crt-knob" />
      <span className="crt-rocker" />
      <span className="crt-led" />
    </>
  ),
  // charcoal workstation: control strip with push buttons and a slit LED
  b: () => (
    <>
      <span className="crt-label">WORKSTATION 17</span>
      <span className="crt-spacer" />
      <span className="crt-btn crt-extra" />
      <span className="crt-btn crt-extra" />
      <span className="crt-btn" />
      <span className="crt-btn" />
      <span className="crt-knob" />
      <span className="crt-led crt-led-slit" />
    </>
  ),
  // all-in-one terminal: floppy slot, logo plate, grille
  c: () => (
    <>
      <span className="crt-floppy" />
      <span className="crt-spacer" />
      <span className="crt-plate crt-extra" />
      <span className="crt-spacer crt-extra" />
      <span className="crt-grille" />
      <span className="crt-led" />
    </>
  ),
  // SVGA monitor on a tilt-swivel stand
  d: () => (
    <>
      <span className="crt-label">SVGA 14&Prime;</span>
      <span className="crt-spacer" />
      <span className="crt-square crt-extra" />
      <span className="crt-square" />
      <span className="crt-square" />
      <span className="crt-pill" />
      <span className="crt-led" />
    </>
  ),
};

function pickModel() {
  const forced = new URLSearchParams(location.search).get("crt");
  if (forced && MODELS[forced]) return forced;
  const keys = Object.keys(MODELS);
  return keys[Math.floor(Math.random() * keys.length)];
}

export default function CrtFrame({ children }) {
  const [model] = useState(pickModel);
  const Controls = MODELS[model];
  return (
    <div className={`crt crt-${model}`} data-crt={model}>
      <div className="crt-case">
        <div className="crt-recess">
          <div className="crt-screen">{children}</div>
        </div>
        <div className="crt-chin" aria-hidden="true">
          <Controls />
        </div>
      </div>
      {model === "d" && <div className="crt-stand" aria-hidden="true" />}
    </div>
  );
}
