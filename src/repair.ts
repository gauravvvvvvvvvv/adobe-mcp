export interface RepairCriterion {
  id: string;
  description: string;
  kind?: "prompt" | "technical" | "visual" | "audio" | "reference" | "render";
  required?: boolean;
}

export interface ReviewCriterion {
  id: string;
  verdict: "pass" | "fail";
  note?: string;
}

export interface RepairDirective {
  criterionId: string;
  kind: string;
  problem: string;
  suggestedCapabilities: string[];
  actions: string[];
  recheck: string[];
}

function has(text: string, words: string[]) {
  const value = text.toLowerCase();
  return words.some((word) => value.includes(word));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function planRepairs(
  criteria: RepairCriterion[],
  reviewCriteria: ReviewCriterion[],
  notes = "",
  validation?: { ok?: boolean; issues?: string[]; warnings?: string[] } | null
) {
  const verdicts = new Map(reviewCriteria.map((criterion) => [criterion.id, criterion]));
  const failed = criteria.filter((criterion) => {
    const verdict = verdicts.get(criterion.id);
    return criterion.required !== false && (!verdict || verdict.verdict !== "pass");
  });

  const directives: RepairDirective[] = failed.map((criterion) => {
    const review = verdicts.get(criterion.id);
    const problem = [criterion.description, review?.note, notes].filter(Boolean).join(" | ");
    const kind = criterion.kind ?? "prompt";
    const capabilities: string[] = [];
    const actions: string[] = [];
    const recheck: string[] = ["creative.preview.generate"];

    if (kind === "audio" || has(problem, ["audio", "dialogue", "voice", "music", "loud", "clip", "noise", "silence", "duck"])) {
      capabilities.push("premiere.audio.mix", "audition.audio.process");
      actions.push("Inspect dialogue/music balance and waveform, then repair clip levels, pan, ducking, mute/solo state or an Audition favorite as appropriate.");
      recheck.push("creative.output.validate");
    }

    if (kind === "render" || has(problem, ["codec", "fps", "resolution", "duration", "render", "export", "missing stream", "file size"])) {
      capabilities.push("premiere.export.render", "media-encoder.queue.manage", "after-effects.render.queue", "creative.output.validate");
      actions.push("Correct export preset/output settings, render again, and validate the resulting file before visual review.");
      recheck.push("creative.output.validate");
    }

    if (kind === "technical" || has(problem, ["gap", "overlap", "flash frame", "timeline", "offline", "missing media", "safe area"])) {
      capabilities.push("premiere.timeline.qa", "premiere.timeline.edit", "premiere.project.manage");
      actions.push("Inspect structural timeline/project state first; repair only the affected ranges or missing media, then rerun structural QA.");
      recheck.push("premiere.timeline.qa");
    }

    if (has(problem, ["caption", "subtitle", "readable", "legible"])) {
      capabilities.push("premiere.captions.manage", "after-effects.text.animate", "photoshop.text.manage");
      actions.push("Repair caption/text timing, placement, scale or styling and verify on the target aspect ratio.");
    }

    if (has(problem, ["mask", "edge", "hair", "composite", "matte", "cutout"])) {
      capabilities.push("photoshop.selection.mask", "photoshop.adjustments.apply", "after-effects.masks.mattes", "after-effects.effects.apply");
      actions.push("Refine selection/mask/matte and match edge softness, color, contrast and light before re-rendering.");
    }

    if (has(problem, ["color", "grade", "contrast", "exposure", "white balance", "saturation", "match"])) {
      capabilities.push("premiere.color.grade", "photoshop.adjustments.apply", "after-effects.effects.apply");
      actions.push("Repair only the mismatched shots/layers, then compare the corrected frames side-by-side with neighboring shots/reference.");
    }

    if (has(problem, ["framing", "crop", "safe", "subject", "reframe", "composition"])) {
      capabilities.push("premiere.motion.animate", "photoshop.layers.manage", "after-effects.properties.animate");
      actions.push("Reframe the affected shot/layer and verify subject visibility plus title/caption safe zones.");
    }

    if (has(problem, ["motion", "animation", "overshoot", "jitter", "camera", "parallax", "logo"])) {
      capabilities.push("after-effects.properties.animate", "after-effects.three-d.scene", "after-effects.shapes.draw");
      actions.push("Adjust timing/easing/keyframes rather than rebuilding the whole composition; inspect the full motion, not only still frames.");
    }

    if (kind === "reference" || has(problem, ["reference", "pacing", "rhythm", "style"])) {
      capabilities.push("creative.reference.analyze", "premiere.timeline.edit", "premiere.timeline.assemble", "after-effects.properties.animate");
      actions.push("Re-read reference timing/style evidence and repair the smallest set of edit or motion decisions responsible for the mismatch.");
    }

    if (kind === "visual" && capabilities.length === 0) {
      capabilities.push("premiere.timeline.edit", "after-effects.properties.animate", "photoshop.layers.manage", "illustrator.vector.transform");
      actions.push("Inspect review frames to localize the visual defect, then patch the smallest affected object/range with the appropriate host.");
    }

    if (kind === "prompt" && capabilities.length === 0) {
      capabilities.push("creative.recipe.list", "creative.recipe.expand");
      actions.push("Re-read the original prompt/constraints, revise only the operations that fail the explicit requirement, and keep passing work intact.");
    }

    if (!actions.length) actions.push("Localize the failed criterion in review artifacts, patch the smallest affected region, then review again.");
    return {
      criterionId: criterion.id,
      kind,
      problem,
      suggestedCapabilities: unique(capabilities),
      actions: unique(actions),
      recheck: unique(recheck)
    };
  });

  const validationIssues = validation && validation.ok === false
    ? [...(validation.issues ?? []), ...(validation.warnings ?? [])]
    : [];

  if (validationIssues.length) {
    directives.unshift({
      criterionId: "__media_validation__",
      kind: "render",
      problem: validationIssues.join("; "),
      suggestedCapabilities: ["premiere.export.render", "media-encoder.queue.manage", "after-effects.render.queue", "creative.output.validate"],
      actions: ["Fix deterministic output validation failures before spending another visual-review pass."],
      recheck: ["creative.output.validate", "creative.preview.generate"]
    });
  }

  return {
    ok: directives.length === 0,
    failedCriteria: failed.map((criterion) => criterion.id),
    directives,
    workflow: directives.length
      ? ["patch", "render_or_export_preview", "creative.output.validate", "inspect_artifacts", "creative.job.review"]
      : ["no_repair_required"]
  };
}
