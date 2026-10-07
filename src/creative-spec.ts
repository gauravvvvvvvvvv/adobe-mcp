import * as z from "zod/v4";

const pathSchema = z.string().min(1);

export const assetRefSchema = z.object({
  id: z.string().min(1).optional(),
  path: pathSchema,
  role: z.enum(["source", "reference", "logo", "music", "voice", "font", "overlay", "other"]).optional().default("source"),
  notes: z.string().optional()
});

export const deliverableSchema = z.object({
  id: z.string().min(1),
  outputPath: pathSchema,
  kind: z.enum(["video", "image", "vector", "project", "audio", "pdf", "other"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  codec: z.string().optional(),
  format: z.string().optional(),
  notes: z.string().optional()
});

export const acceptanceCriterionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  description: z.string().min(3),
  kind: z.enum(["prompt", "technical", "visual", "audio", "reference", "render"]).optional().default("prompt"),
  required: z.boolean().optional().default(true)
});

export const editOperationSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  phase: z.enum(["preflight", "assembly", "graphics", "vfx", "color", "audio", "captions", "export", "review", "repair"]),
  capability: z.string().min(3),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  label: z.string().optional(),
  required: z.boolean().optional().default(true)
});

export const editSpecSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  assets: z.array(assetRefSchema).optional().default([]),
  references: z.array(assetRefSchema).optional().default([]),
  workingFiles: z.array(pathSchema).optional().default([]),
  intent: z.object({
    audience: z.string().optional(),
    story: z.string().optional(),
    style: z.array(z.string()).optional().default([]),
    pacing: z.string().optional(),
    color: z.string().optional(),
    typography: z.string().optional(),
    sound: z.string().optional(),
    constraints: z.array(z.string()).optional().default([])
  }).optional().default({ style: [], constraints: [] }),
  deliverables: z.array(deliverableSchema).min(1),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
  operations: z.array(editOperationSchema).optional().default([]),
  review: z.object({
    required: z.boolean().optional().default(true),
    maxPasses: z.number().int().min(1).max(20).optional().default(3),
    requireVisualReview: z.boolean().optional().default(true),
    requireAudioReview: z.boolean().optional().default(true),
    requireTechnicalValidation: z.boolean().optional().default(true)
  }).optional().default({
    required: true,
    maxPasses: 3,
    requireVisualReview: true,
    requireAudioReview: true,
    requireTechnicalValidation: true
  })
});

export type EditSpec = z.infer<typeof editSpecSchema>;
export type EditOperation = z.infer<typeof editOperationSchema>;

export function validateEditSpec(input: unknown) {
  const parsed = editSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, spec: parsed.data };
  return {
    ok: false as const,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message
    }))
  };
}
