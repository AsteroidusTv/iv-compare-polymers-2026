import type { Sample } from "./iv-data";

// Lab confirmation: these ordinal silicone labels identify preparation campaigns,
// not different chemical formulations. Preserve material_raw for provenance.
const SILICONE_CAMPAIGNS = new Set(["Silicone, 2nd", "Silicone, 3d", "Silicones, 4th", "Silicones, 5th", "Silicones"]);
// Owner/laboratory confirmation: these recorded names refer to the same
// formulation within each family, not distinct compositions or supplier grades.
const FORMULATION_ALIASES: Record<string, ReadonlySet<string>> = {
  "POE-2 / TF4": new Set(["TF4", "POE-2_TF4"]),
  "TPO-1 / DNP-CVF": new Set(["DNP/CVF", "DNP-CVF 2Ssa", "DNP-CVF(Lisa roll)", "TPO-1_CVF"]),
  "TPO-2 / Lenzing": new Set(["TPO Lenzing", "Lenzing", "TPO-2_Lenzing"]),
};
export function canonicalFormulation(material: string, recorded: string | null | undefined): string | null {
  if (recorded && FORMULATION_ALIASES[material]?.has(recorded)) return material;
  return material === "Silicone / PDMS" && recorded && SILICONE_CAMPAIGNS.has(recorded)
    ? "Silicone / PDMS" : recorded ?? null;
}
export function sampleFormulation(sample: Pick<Sample, "material_family" | "material_raw">): string | null {
  return canonicalFormulation(sample.material_family, sample.material_raw);
}
