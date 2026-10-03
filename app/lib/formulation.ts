import type { Sample } from "./iv-data";

// Lab confirmation: these ordinal silicone labels identify preparation campaigns,
// not different chemical formulations. Preserve material_raw for provenance.
const SILICONE_CAMPAIGNS = new Set(["Silicone, 2nd", "Silicone, 3d", "Silicones, 4th", "Silicones, 5th", "Silicones"]);
export function canonicalFormulation(material: string, recorded: string | null | undefined): string | null {
  return material === "Silicone / PDMS" && recorded && SILICONE_CAMPAIGNS.has(recorded)
    ? "Silicone / PDMS" : recorded ?? null;
}
export function sampleFormulation(sample: Pick<Sample, "material_family" | "material_raw">): string | null {
  return canonicalFormulation(sample.material_family, sample.material_raw);
}
