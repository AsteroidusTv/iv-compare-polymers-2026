export interface MaterialStyle { color: string; marker: "circle" | "square" | "diamond" | "triangle"; dash: string }
// Color-blind-conscious family registry; never index by selection order.
const REGISTRY: Record<string, MaterialStyle> = {
  "EVA": { color: "#D55E00", marker: "circle", dash: "" },
  "POE-1 / Mitsui": { color: "#E69F00", marker: "diamond", dash: "7 3" },
  "POE-2 / TF4": { color: "#0072B2", marker: "square", dash: "" },
  "POE-3 / Cybrid T22": { color: "#CC79A7", marker: "triangle", dash: "3 3" },
  "Silicone / PDMS": { color: "#009E73", marker: "circle", dash: "8 3 2 3" },
  "TPO-1 / DNP-CVF": { color: "#A65300", marker: "diamond", dash: "" },
  "TPO-2 / Lenzing": { color: "#56B4E9", marker: "triangle", dash: "7 3" },
  "Ionomer NA390": { color: "#595959", marker: "square", dash: "3 3" },
};
export function materialStyle(material: string): MaterialStyle {
  if (REGISTRY[material]) return { ...REGISTRY[material] };
  let hash = 2166136261;
  for (const character of material) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return { color: `hsl(${hash % 360} 55% 35%)`, marker: ["circle", "square", "diamond", "triangle"][hash % 4] as MaterialStyle["marker"], dash: hash % 2 ? "7 3" : "" };
}
