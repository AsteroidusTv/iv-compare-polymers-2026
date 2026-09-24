export interface MaterialStyle { color: string; marker: "circle" | "square" | "diamond" | "triangle"; dash: string }
/** SVG paths keep the same marker geometry in DOM, SVG and PNG exports. */
export function markerPath(marker:MaterialStyle["marker"]="circle",x:number,y:number,r:number):string {
  if(marker==="square")return `M${x-r} ${y-r}h${2*r}v${2*r}h${-2*r}Z`;
  if(marker==="diamond")return `M${x} ${y-r*1.3}L${x+r*1.3} ${y}L${x} ${y+r*1.3}L${x-r*1.3} ${y}Z`;
  if(marker==="triangle")return `M${x} ${y-r*1.4}L${x+r*1.3} ${y+r}L${x-r*1.3} ${y+r}Z`;
  return `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`;
}
export function identityLinePattern(identity:string):string {
  let hash=2166136261;
  for(const character of identity)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
  return ["","8 4","2 4","11 4 2 4","14 4","5 3"][hash%6];
}
export function segmentLinePattern(primary:boolean,status:string|undefined,seriesPattern?:string):string|undefined {
  if(status==="suspected_export_residue") return "1 3";
  return primary?seriesPattern:"6 4";
}
// Color-blind-conscious family registry; never index by selection order.
const REGISTRY: Record<string, MaterialStyle> = {
  "EVA": { color: "#D55E00", marker: "circle", dash: "" },
  "POE-1 / Mitsui": { color: "#E69F00", marker: "diamond", dash: "7 3" },
  "POE-2 / TF4": { color: "#0072B2", marker: "square", dash: "" },
  "POE-3 / Cybrid T22": { color: "#CC79A7", marker: "triangle", dash: "3 3" },
  "Silicone / PDMS": { color: "#009E73", marker: "circle", dash: "8 3 2 3" },
  "TPO-1 / DNP-CVF": { color: "#A65300", marker: "diamond", dash: "" },
  "TPO-2 / Lenzing": { color: "#7F3C8D", marker: "triangle", dash: "7 3" },
  "Ionomer NA390": { color: "#595959", marker: "square", dash: "3 3" },
};
export function materialStyle(material: string): MaterialStyle {
  if (REGISTRY[material]) return { ...REGISTRY[material] };
  let hash = 2166136261;
  for (const character of material) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return { color: `hsl(${hash % 360} 55% 35%)`, marker: ["circle", "square", "diamond", "triangle"][hash % 4] as MaterialStyle["marker"], dash: hash % 2 ? "7 3" : "" };
}
