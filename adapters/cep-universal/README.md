# Universal CEP adapter

One persistent CEP extension targets:

- Premiere Pro
- After Effects
- Illustrator
- InDesign

It detects the active host, registers only that host with the local broker and serializes all `evalScript` calls.

## Architecture

The model does not normally write raw ExtendScript. Semantic operations are compiled inside `src/compilers/` and sent to this adapter as internal scripts.

Premiere currently has the deepest coverage: project/media management, assembly/edit/speed, keyframes, effects/transitions, color/LUT, audio levels, MOGRT, caption import, Media Encoder handoff and structural QA.

After Effects has composition/layer creation, generic property animation, text/shape primitives and render queue controls.

Illustrator has document/artboard, vector primitives, transforms, appearance/text basics and raster/SVG export.

InDesign is currently context-only and must not be presented as a full editing adapter.

## Installation

Windows:

```powershell
npm run install:windows
```

macOS:

```bash
npm run install:macos
```

Once discovered by an Adobe host, the adapter reconnects to Adobe MCP automatically. Restarting the MCP is not required when Adobe applications close/reopen.

See `docs/ACCEPTANCE.md` for the real-host release gate.
