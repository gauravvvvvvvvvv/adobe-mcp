import { compileAfterEffects } from "./after-effects.js";
import { compileIllustrator } from "./illustrator.js";
import { compilePremiere } from "./premiere.js";

export function compileInvocation(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (capability.startsWith("premiere.")) return compilePremiere(capability, params);
  if (capability.startsWith("after-effects.")) return compileAfterEffects(capability, params);
  if (capability.startsWith("illustrator.")) return compileIllustrator(capability, params);
  return params;
}
