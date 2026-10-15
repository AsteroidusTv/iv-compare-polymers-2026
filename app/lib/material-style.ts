import { figureBatchLabel, figureFormulationLabel } from "./figure-language";

export interface MaterialStyle { color: string; marker: "circle" | "square" | "diamond" | "triangle" | "cross" | "star"; dash: string }
/** Compare same-family aggregates without relying on colour or a hash collision. */
export function aggregateSeriesMarkers<T extends { id: string; config: { material: string }; marker?: MaterialStyle["marker"] }>(series: T[]): T[] {
  const shapes: MaterialStyle["marker"][] = ["circle", "square", "triangle", "diamond", "cross", "star"];
  return series.map(item => {
    const peers = series.filter(peer => peer.config.material === item.config.material).map(peer => peer.id).sort();
    return peers.length < 2 ? item : { ...item, marker: shapes[peers.indexOf(item.id) % shapes.length] };
  });
}
/** Presentation only: a pooled EVA population must not masquerade as one formulation. */
export function evaFormulationStyle(material: string, formulations: Array<string | null | undefined>) {
  const values = [...new Set(formulations)];
  if (material !== "EVA" || values.length !== 1) return null;
  if (values[0] === "EVA 406") return { label: "EVA 406", linePattern: "" };
  if (values[0] === "EVA 806") return { label: "EVA 806", linePattern: "14 7" };
  return null;
}
/** Keep known EVA formulations separate even in an individual-sample export legend. */
export function individualTrendPresentation(material: string, formulation: string | null | undefined, seriesId: string, sampleUid: string, batch?: string | null) {
  const style = evaFormulationStyle(material, [formulation]);
  const label = figureFormulationLabel({ material_family: material, material_raw: formulation });
  return {
    exportLabel: `${label}${batch !== undefined ? ` — ${figureBatchLabel([batch])}` : ""}`,
    exportLegendKey: batch !== undefined ? JSON.stringify([seriesId, label, batch]) : style ? JSON.stringify([seriesId, style.label]) : seriesId,
    linePattern: style?.linePattern ?? identityLinePattern(sampleUid),
  };
}
/** SVG paths keep the same marker geometry in DOM, SVG and PNG exports. */
export function markerPath(marker:MaterialStyle["marker"]="circle",x:number,y:number,r:number):string {
  if(marker==="cross")return `M${x-r/2} ${y-r*1.4}h${r}v${r*.9}h${r*.9}v${r}h${-r*.9}v${r*.9}h${-r}v${-r*.9}h${-r*.9}v${-r}h${r*.9}Z`;
  if(marker==="star")return Array.from({length:10},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/5,radius=i%2?r*.65:r*1.5;return `${i?"L":"M"}${x+Math.cos(angle)*radius} ${y+Math.sin(angle)*radius}`;}).join("")+"Z";
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

/** Stable across plot selections: styles are assigned from the complete specimen registry. */
export function specimenStylesById(samples: import("./iv-data").Sample[]): Map<string, MaterialStyle> {
  const patterns = ["", "8 4", "2 4", "11 4 2 4", "14 4", "5 3"];
  const markers: MaterialStyle["marker"][] = ["circle", "square", "triangle", "diamond", "cross", "star"];
  const groups = new Map<string, import("./iv-data").Sample[]>();
  for (const sample of samples) {
    // EVA 406/806 share a family colour: assigning across the whole family
    // prevents two formulations from accidentally sharing the same dash/marker.
    const key = sample.material_family;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return new Map([...groups.values()].flatMap(group => [...group].sort((a,b) => a.sample_uid.localeCompare(b.sample_uid, "en", { numeric: true })).map((sample, index) => {
    const base = materialStyle(sample.material_family);
    return [sample.sample_uid, { ...base, dash: patterns[index % patterns.length],
      marker: index < patterns.length ? base.marker : markers[(markers.indexOf(base.marker) + Math.floor(index / patterns.length)) % markers.length] }] as const;
  })));
}
