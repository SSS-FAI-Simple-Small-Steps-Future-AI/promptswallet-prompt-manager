import type { Nav } from "../types";

export function sameNav(a: Nav, b: Nav): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "category" && b.kind === "category") {
    return a.scope === b.scope && a.name === b.name && (a.pack ?? null) === (b.pack ?? null);
  }
  return true;
}
