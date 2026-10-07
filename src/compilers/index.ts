import { compileAfterEffects } from "./after-effects.js";
import { compileAnimate } from "./animate.js";
import { compileAudition } from "./audition.js";
import { compileBridge } from "./bridge.js";
import { compileIllustrator } from "./illustrator.js";
import { compileInDesign } from "./indesign.js";
import { compilePremiere } from "./premiere.js";

export function compileInvocation(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (capability.startsWith("premiere.")) return compilePremiere(capability, params);
  if (capability.startsWith("after-effects.")) return compileAfterEffects(capability, params);
  if (capability.startsWith("illustrator.")) return compileIllustrator(capability, params);
  if (capability.startsWith("indesign.")) return compileInDesign(capability, params);
  if (capability.startsWith("animate.")) return compileAnimate(capability, params);
  if (capability.startsWith("audition.")) return compileAudition(capability, params);
  if (capability.startsWith("bridge.")) return compileBridge(capability, params);
  return params;
}
