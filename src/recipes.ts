export interface CreativeRecipe {
  id: string;
  title: string;
  apps: string[];
  summary: string;
  inputs: Record<string, string>;
  output: {
    operations: Array<{
      phase: string;
      capability: string;
      params: Record<string, unknown>;
      label?: string;
      required?: boolean;
    }>;
    acceptanceCriteria: Array<{
      id: string;
      description: string;
      kind: "prompt" | "technical" | "visual" | "audio" | "reference" | "render";
      required: boolean;
    }>;
    notes: string[];
  };
}

function mustObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(name + "_object_required");
  return value as Record<string, unknown>;
}

function mustArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(name + "_array_required");
  return value;
}

function text(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (fallback !== undefined) return fallback;
  throw new Error("string_required");
}

function num(value: unknown, fallback?: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n)) return n;
  if (fallback !== undefined) return fallback;
  throw new Error("number_required");
}

function op(
  id: string,
  phase: string,
  capability: string,
  params: Record<string, unknown>,
  label?: string
) {
  return { id, phase, capability, params, label, required: true };
}

export function listRecipes() {
  return [
    {
      id: "premiere.rough-cut",
      title: "Premiere rough cut",
      apps: ["premiere"],
      summary: "Assemble explicit source selects into a clean base sequence, then run structural QA."
    },
    {
      id: "premiere.jl-cut",
      title: "Premiere J/L cut",
      apps: ["premiere"],
      summary: "Offset paired video/audio clip boundaries to create dialogue-led J-cuts or picture-led L-cuts."
    },
    {
      id: "premiere.beat-cut",
      title: "Premiere beat cut",
      apps: ["premiere"],
      summary: "Place explicit source selects at beat timestamps for music-synced montage editing."
    },
    {
      id: "premiere.social-cutdown",
      title: "Premiere social cutdown",
      apps: ["premiere"],
      summary: "Build a short vertical/social edit with reframing, captions, loudness-aware audio and delivery QA."
    },
    {
      id: "after-effects.kinetic-typography",
      title: "Kinetic typography",
      apps: ["after-effects"],
      summary: "Create timed text layers with scale/opacity intro motion and optional per-layer property animation."
    },
    {
      id: "after-effects.logo-reveal",
      title: "Logo reveal",
      apps: ["after-effects"],
      summary: "Build a simple logo reveal with transform animation, overshoot and optional supporting text."
    },
    {
      id: "after-effects.parallax",
      title: "Parallax camera move",
      apps: ["after-effects"],
      summary: "Build layered 3D parallax with a camera move from depth-separated source layers."
    },
    {
      id: "photoshop.composite",
      title: "Photoshop composite",
      apps: ["photoshop"],
      summary: "Create a layered composite workflow using document, layer, selection/mask, adjustment and export primitives."
    },
    {
      id: "illustrator.logo-system",
      title: "Illustrator logo/vector system",
      apps: ["illustrator"],
      summary: "Build a repeatable vector mark from primitive paths, transforms, appearance and typography."
    }
  ];
}

export function expandRecipe(id: string, input: Record<string, unknown>): CreativeRecipe {
  if (id === "premiere.rough-cut") {
    const clips = mustArray(input.clips, "clips");
    const sequence = typeof input.sequence === "string" ? input.sequence : undefined;
    return {
      id,
      title: "Premiere rough cut",
      apps: ["premiere"],
      summary: "Assemble explicit selects and structurally verify the resulting cut.",
      inputs: {
        clips: "Array of {path, sourceIn, sourceOut, videoTrack?, audioTrack?, at?}",
        sequence: "Optional sequence name/ID",
        startAt: "Optional sequence start time"
      },
      output: {
        operations: [
          op("assemble", "assembly", "premiere.timeline.assemble", {
            sequence,
            clips,
            startAt: num(input.startAt, 0),
            clear: input.clear === true
          }, "Assemble source selects"),
          op("qa", "review", "premiere.timeline.qa", {
            sequence,
            minClipSeconds: num(input.minClipSeconds, 0.08),
            gapToleranceSeconds: num(input.gapToleranceSeconds, 0.001)
          }, "Check gaps, overlaps and flash frames")
        ],
        acceptanceCriteria: [
          { id: "timeline.clean", description: "Timeline has no unintended gaps, overlaps or flash-frame clips.", kind: "technical", required: true },
          { id: "story.coherent", description: "The selected shots form a coherent sequence matching the requested story.", kind: "visual", required: true }
        ],
        notes: [
          "Provide explicit sourceIn/sourceOut for deterministic assembly.",
          "Use reference analysis before this recipe if matching another video's pacing."
        ]
      }
    };
  }

  if (id === "premiere.jl-cut") {
    const videoTarget = mustObject(input.videoTarget, "videoTarget");
    const audioTarget = mustObject(input.audioTarget, "audioTarget");
    const sequence = typeof input.sequence === "string" ? input.sequence : undefined;
    const cutType = String(input.type ?? "j").toLowerCase() === "l" ? "l" : "j";
    const offset = Math.max(0.01, num(input.offsetSeconds, 0.35));
    const videoDuration = input.videoDuration === undefined ? undefined : num(input.videoDuration);
    const audioDuration = input.audioDuration === undefined ? undefined : num(input.audioDuration);

    const operations = [];
    if (videoDuration !== undefined) {
      operations.push(op("trim-video", "assembly", "premiere.timeline.edit", {
        sequence,
        operation: "trim",
        target: { ...videoTarget, trackType: "video" },
        duration: videoDuration
      }, "Trim picture side"));
    }
    if (audioDuration !== undefined) {
      operations.push(op("trim-audio", "audio", "premiere.timeline.edit", {
        sequence,
        operation: "trim",
        target: { ...audioTarget, trackType: "audio" },
        duration: audioDuration
      }, "Trim audio side"));
    }
    operations.push(op("qa", "review", "premiere.timeline.qa", { sequence }, "Check resulting timeline structure"));

    return {
      id,
      title: "Premiere " + cutType.toUpperCase() + "-cut",
      apps: ["premiere"],
      summary: "Create dialogue-led or picture-led offset edits using independently addressable audio/video timeline clips.",
      inputs: {
        type: "j or l",
        videoTarget: "Premiere video clip target",
        audioTarget: "Premiere audio clip target",
        videoDuration: "Desired picture duration when known",
        audioDuration: "Desired audio duration when known"
      },
      output: {
        operations,
        acceptanceCriteria: [
          { id: "edit.intent", description: cutType === "j" ? "Incoming audio begins before the incoming picture." : "Outgoing audio continues after the outgoing picture.", kind: "audio", required: true },
          { id: "edit.clean", description: "No unintended timeline gap or overlap was introduced.", kind: "technical", required: true }
        ],
        notes: [
          "The recipe assumes independently addressable audio/video timeline items.",
          "Offset hint: " + offset + " seconds. The caller should choose concrete durations/targets from inspected timeline context."
        ]
      }
    };
  }

  if (id === "premiere.beat-cut") {
    const clips = mustArray(input.clips, "clips").map((value, index) => {
      const clip = mustObject(value, "clip");
      const beat = Array.isArray(input.beats) ? input.beats[index] : undefined;
      return {
        ...clip,
        at: clip.at === undefined ? num(beat, 0) : clip.at,
        label: typeof clip.label === "string" ? clip.label : "beat-" + (index + 1)
      };
    });
    return {
      id,
      title: "Premiere beat cut",
      apps: ["premiere"],
      summary: "Place source selects on explicit beat times.",
      inputs: {
        clips: "Source select array",
        beats: "Beat timestamps in seconds, same order as clips",
        sequence: "Optional sequence name/ID"
      },
      output: {
        operations: [
          op("beat-assemble", "assembly", "premiere.timeline.assemble", {
            sequence: typeof input.sequence === "string" ? input.sequence : undefined,
            clips
          }),
          op("beat-qa", "review", "premiere.timeline.qa", {
            sequence: typeof input.sequence === "string" ? input.sequence : undefined
          })
        ],
        acceptanceCriteria: [
          { id: "beats.sync", description: "Visual edit points align with the intended beat timestamps.", kind: "audio", required: true },
          { id: "beats.pacing", description: "Beat-synced cutting still feels readable rather than mechanically over-cut.", kind: "visual", required: true }
        ],
        notes: ["Derive beat timestamps outside Premiere from music analysis or provide them directly."]
      }
    };
  }

  if (id === "premiere.social-cutdown") {
    const sequence = typeof input.sequence === "string" ? input.sequence : undefined;
    const captionPath = typeof input.captionPath === "string" ? input.captionPath : undefined;
    const target = input.heroTarget && typeof input.heroTarget === "object" ? input.heroTarget as Record<string, unknown> : undefined;
    const operations = [];
    if (target) {
      operations.push(op("reframe", "graphics", "premiere.motion.animate", {
        sequence,
        target,
        keyframes: [
          { time: 0, property: "Scale", value: num(input.scale, 115) }
        ]
      }, "Reframe hero subject"));
    }
    if (captionPath) {
      operations.push(op("captions", "captions", "premiere.captions.manage", {
        sequence,
        operation: "importSrt",
        path: captionPath,
        start: 0,
        format: "subtitle"
      }, "Import social captions"));
    }
    operations.push(op("qa", "review", "premiere.timeline.qa", { sequence }, "Structural QA"));
    return {
      id,
      title: "Premiere social cutdown",
      apps: ["premiere"],
      summary: "Adapt a sequence for social delivery while preserving readability, captions and punch.",
      inputs: {
        sequence: "Target social sequence",
        heroTarget: "Optional main video clip target to reframe",
        scale: "Optional initial Motion Scale percentage",
        captionPath: "Optional local SRT path"
      },
      output: {
        operations,
        acceptanceCriteria: [
          { id: "social.safe", description: "Important subjects and graphics stay inside the target vertical/social safe area.", kind: "visual", required: true },
          { id: "social.captions", description: "Dialogue is readable with captions when captions are requested.", kind: "visual", required: captionPath !== undefined },
          { id: "social.pacing", description: "The cut reaches the core hook quickly and sustains mobile-viewing pace.", kind: "prompt", required: true }
        ],
        notes: [
          "Create/activate the desired aspect-ratio sequence before expansion when a dedicated sequence preset is required.",
          "Run creative.output.validate with target width/height/fps after export."
        ]
      }
    };
  }

  if (id === "after-effects.kinetic-typography") {
    const lines = mustArray(input.lines, "lines");
    const composition = typeof input.composition === "string" ? input.composition : undefined;
    const operations = lines.map((value, index) => {
      const line = typeof value === "string" ? { text: value } : mustObject(value, "line");
      const start = num(line.start, index * num(input.stepSeconds, 0.65));
      return op(
        "text-" + (index + 1),
        "graphics",
        "after-effects.text.animate",
        {
          composition,
          text: text(line.text),
          name: typeof line.name === "string" ? line.name : "Text " + (index + 1),
          start,
          duration: num(line.duration, num(input.duration, 2.2)),
          animateIn: num(line.animateIn, num(input.animateIn, 0.28)),
          fontSize: num(line.fontSize, num(input.fontSize, 96)),
          position: Array.isArray(line.position) ? line.position : input.position
        },
        "Animate text line " + (index + 1)
      );
    });
    return {
      id,
      title: "After Effects kinetic typography",
      apps: ["after-effects"],
      summary: "Create a sequence of timed, animated text layers.",
      inputs: {
        lines: "Array of strings or {text,start,duration,fontSize,position}",
        composition: "Optional target comp",
        stepSeconds: "Default spacing between lines"
      },
      output: {
        operations,
        acceptanceCriteria: [
          { id: "type.readable", description: "Typography remains legible throughout all motion.", kind: "visual", required: true },
          { id: "type.rhythm", description: "Text entrances follow the intended rhythm and emphasis.", kind: "reference", required: true }
        ],
        notes: ["Use after-effects.properties.animate after this recipe for custom exits, overshoot or per-word motion."]
      }
    };
  }

  if (id === "after-effects.logo-reveal") {
    const composition = typeof input.composition === "string" ? input.composition : undefined;
    const layer = mustObject(input.logoTarget, "logoTarget");
    const start = num(input.start, 0);
    const reveal = Math.max(0.1, num(input.revealSeconds, 0.8));
    return {
      id,
      title: "After Effects logo reveal",
      apps: ["after-effects"],
      summary: "Animate logo opacity and scale with a simple overshoot.",
      inputs: {
        logoTarget: "AE layer target {name|index}",
        composition: "Optional target comp",
        start: "Reveal start",
        revealSeconds: "Reveal duration"
      },
      output: {
        operations: [
          op("logo-reveal", "graphics", "after-effects.properties.animate", {
            composition,
            target: layer,
            keyframes: [
              { time: start, path: ["ADBE Transform Group", "ADBE Opacity"], value: 0, easeInfluence: 70 },
              { time: start + reveal * 0.75, path: ["ADBE Transform Group", "ADBE Opacity"], value: 100, easeInfluence: 70 },
              { time: start, path: ["ADBE Transform Group", "ADBE Scale"], value: [70, 70], easeInfluence: 70 },
              { time: start + reveal * 0.72, path: ["ADBE Transform Group", "ADBE Scale"], value: [106, 106], easeInfluence: 70 },
              { time: start + reveal, path: ["ADBE Transform Group", "ADBE Scale"], value: [100, 100], easeInfluence: 70 }
            ]
          }, "Animate logo reveal")
        ],
        acceptanceCriteria: [
          { id: "logo.crisp", description: "Logo remains visually crisp and readable throughout the reveal.", kind: "visual", required: true },
          { id: "logo.motion", description: "Overshoot settles cleanly without jitter or awkward timing.", kind: "visual", required: true }
        ],
        notes: ["For path-trim or particle reveals, extend with shape/effect-specific operations after this base recipe."]
      }
    };
  }

  if (id === "after-effects.parallax") {
    const composition = typeof input.composition === "string" ? input.composition : undefined;
    const layers = mustArray(input.layers, "layers");
    const operations = layers.map((value, index) => {
      const layer = mustObject(value, "layer");
      const depth = num(layer.depth, index * 300);
      return op("depth-" + (index + 1), "vfx", "after-effects.properties.animate", {
        composition,
        target: mustObject(layer.target, "target"),
        keyframes: [
          { time: 0, path: ["ADBE Transform Group", "ADBE Position"], value: [0, 0, depth] }
        ]
      }, "Place layer in 3D depth");
    });
    operations.unshift(op("camera", "vfx", "after-effects.layers.manage", {
      composition,
      operation: "camera",
      name: typeof input.cameraName === "string" ? input.cameraName : "Parallax Camera",
      center: Array.isArray(input.center) ? input.center : [960, 540]
    }, "Create parallax camera"));
    return {
      id,
      title: "After Effects parallax",
      apps: ["after-effects"],
      summary: "Prepare depth-separated layers and a camera for parallax animation.",
      inputs: {
        layers: "Array of {target:{name|index},depth}",
        composition: "Optional target comp"
      },
      output: {
        operations,
        acceptanceCriteria: [
          { id: "parallax.depth", description: "Foreground and background layers show clear but believable depth separation.", kind: "visual", required: true },
          { id: "parallax.edges", description: "Camera movement never reveals empty layer edges.", kind: "technical", required: true }
        ],
        notes: ["Use after-effects.properties.animate on the camera after expansion to define the actual push/pan."]
      }
    };
  }

  if (id === "photoshop.composite") {
    return {
      id,
      title: "Photoshop composite",
      apps: ["photoshop"],
      summary: "A compact compositing sequence built from typed Photoshop operations.",
      inputs: {
        subjectPath: "Optional image to open as starting document",
        exportPath: "Optional PNG/JPEG/PSD output"
      },
      output: {
        operations: [
          ...(typeof input.subjectPath === "string"
            ? [op("open", "preflight", "photoshop.document.manage", { operation: "open", path: input.subjectPath }, "Open subject")]
            : []),
          op("subject-selection", "graphics", "photoshop.selection.mask", { operation: "subject" }, "Select subject"),
          op("subject-mask", "graphics", "photoshop.selection.mask", { operation: "maskFromSelection", reveal: true }, "Mask subject"),
          ...(typeof input.exportPath === "string"
            ? [op("export", "export", "photoshop.export.assets", {
                path: input.exportPath,
                format: String(input.exportPath).split(".").pop()
              }, "Export composite")]
            : [])
        ],
        acceptanceCriteria: [
          { id: "composite.edges", description: "Mask edges are clean and natural at hair/fine-detail boundaries.", kind: "visual", required: true },
          { id: "composite.match", description: "Subject, background, contrast and color feel like one photograph.", kind: "visual", required: true }
        ],
        notes: ["Add explicit layer/import/adjustment operations between mask and export based on the prompt/reference."]
      }
    };
  }

  if (id === "illustrator.logo-system") {
    const shapes = mustArray(input.shapes, "shapes");
    const operations = shapes.map((value, index) => {
      const shape = mustObject(value, "shape");
      return op("shape-" + (index + 1), "graphics", "illustrator.vector.create", shape, "Create vector primitive " + (index + 1));
    });
    if (typeof input.wordmark === "string") {
      operations.push(op("wordmark", "graphics", "illustrator.text.manage", {
        operation: "create",
        text: input.wordmark,
        name: "Wordmark",
        x: num(input.wordmarkX, 0),
        y: num(input.wordmarkY, 0),
        fontSize: num(input.fontSize, 72)
      }, "Create wordmark"));
    }
    return {
      id,
      title: "Illustrator logo/vector system",
      apps: ["illustrator"],
      summary: "Create a vector mark from deterministic primitives plus optional wordmark.",
      inputs: {
        shapes: "Array of illustrator.vector.create parameter objects",
        wordmark: "Optional wordmark text"
      },
      output: {
        operations,
        acceptanceCriteria: [
          { id: "logo.vector", description: "Mark remains clean and scalable as vector artwork.", kind: "technical", required: true },
          { id: "logo.balance", description: "Shape spacing, weight and wordmark balance feel intentional.", kind: "visual", required: true }
        ],
        notes: ["Export SVG/PNG variants with illustrator.export.assets after visual review."]
      }
    };
  }

  throw new Error("creative_recipe_not_found:" + id);
}
