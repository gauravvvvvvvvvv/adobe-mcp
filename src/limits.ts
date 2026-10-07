export interface RuntimeLimit {
  id: string;
  host: string;
  surface: string;
  status: "host-limited" | "tooling-required" | "version-dependent";
  limitation: string;
  fallback: string;
}

export const RUNTIME_LIMITS: RuntimeLimit[] = [
  {
    id: "premiere.audio-track-mixer",
    host: "premiere",
    surface: "Audio Track Mixer automation / sends",
    status: "host-limited",
    limitation: "The legacy Premiere scripting surface used for broad-version compatibility does not expose the full Audio Track Mixer automation/send model.",
    fallback: "Use typed clip Volume/Pan/keyframes/ducking, track mute, per-clip audio effects/transitions, or hand off dedicated audio work to Audition when available."
  },
  {
    id: "premiere.caption-style-readback",
    host: "premiere",
    surface: "Caption styling/readback",
    status: "version-dependent",
    limitation: "Legacy scripting reliably creates caption tracks from caption ProjectItems but does not expose a stable cross-version styling/readback API.",
    fallback: "Import structured SRT/caption media through premiere.captions.manage and verify the rendered result. Use version-specific Premiere UXP extensions only after real-host validation."
  },
  {
    id: "premiere.mogrt-source-text",
    host: "premiere",
    surface: "MOGRT Source Text serialization",
    status: "version-dependent",
    limitation: "MOGRT editable text may be exposed as plain strings or version/template-specific serialized JSON payloads.",
    fallback: "Use named property writes and component inspection first; the adapter applies best-effort known Source Text payload mutation and returns property readback for verification."
  },
  {
    id: "photoshop.generic-batchplay",
    host: "photoshop",
    surface: "Unmodeled Photoshop actions",
    status: "version-dependent",
    limitation: "Photoshop's DOM does not wrap every Action Manager command and descriptor schemas vary by feature/version.",
    fallback: "Use typed DOM/semantic handlers first; use the explicit batchPlay descriptor escape hatch for recorded/version-specific actions and verify the result."
  },
  {
    id: "photoshop.exotic-adjustments",
    host: "photoshop",
    surface: "Exotic adjustment-layer parameter schemas",
    status: "version-dependent",
    limitation: "Common adjustment parameters are typed, while less-common adjustment types retain Action Manager-specific descriptor schemas.",
    fallback: "Use typed brightness/contrast, levels, hue/saturation, exposure and vibrance setters; provide a recorded descriptor for less-common adjustments."
  },
  {
    id: "audition-effect-rack",
    host: "audition",
    surface: "Deep effect-rack graph editing",
    status: "host-limited",
    limitation: "Audition's CEP scripting surface does not expose the full interactive effect-rack graph as a stable programmable DOM.",
    fallback: "Use typed document/transport/favorite/save/marker/command operations and invoke known Favorites/commands for repeatable processing."
  },
  {
    id: "uxp-ccx-packaging",
    host: "photoshop/media-encoder",
    surface: "Adobe-supported CCX package generation",
    status: "tooling-required",
    limitation: "A distributable UXP .ccx must be produced by Adobe's desktop UXP Developer Tool; hand-rolling an archive is not treated as supported packaging.",
    fallback: "Load manifests directly for development now; package/install the final CCX on a workstation with UXP Developer Tool."
  }
];

export function runtimeLimits(host?: string): RuntimeLimit[] {
  const normalized = host?.trim().toLowerCase();
  return normalized
    ? RUNTIME_LIMITS.filter((item) => item.host.toLowerCase().split("/").includes(normalized))
    : RUNTIME_LIMITS;
}
