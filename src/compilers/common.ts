export function js(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function wrapScript(body: string): string {
  return "(function(){try{" + body + "}catch(e){return JSON.stringify({success:false,error:String(e),stack:e&&e.stack?String(e.stack):null});}})()";
}

export function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(key + "_required");
  return value;
}

export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function finiteNumber(value: unknown, fallback?: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(number)) return number;
  if (fallback !== undefined) return fallback;
  throw new Error("number_required");
}

export function integer(value: unknown, fallback = 0): number {
  return Math.trunc(finiteNumber(value, fallback));
}

export function objectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
}
