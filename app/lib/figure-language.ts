import type { MetricKey, Sample } from "./iv-data";
import { sampleFormulation } from "./formulation";
import { pearlMetric } from "./light-ageing-metrics";
import { materialLabel, recordedCellNumber } from "./public-labels";

/** Publication wording only: never replace recorded identities or grouping keys. */
export function figureFormulationLabel(sample: Pick<Sample, "material_family" | "material_raw">): string {
  const family = sample.material_family;
  if (!family) return "Matériau non renseigné";
  if (family === "Silicone / PDMS") return "PDMS";
  const formulation = sampleFormulation(sample)?.trim();
  if (!formulation || formulation === family) return materialLabel(family);
  // Canonical supplier wording is redundant with the numbered formulation.
  const normalized = formulation.toLowerCase().replace(/[^a-z0-9]/g, "");
  const familyNormalized = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Recorded Cybrid aliases omit the T22 suffix; hide supplier wording only,
  // while keeping the original formulation keys distinct in the analysis.
  if (family === "POE-3 / Cybrid T22" && ["cybrid", "poe3cybrid"].includes(normalized)) return materialLabel(family);
  if (/^(POE|TPO)-\d+\s*\//.test(family) && (familyNormalized.endsWith(normalized)
    || normalized === familyNormalized.replace("dnp", "")
    || normalized === familyNormalized.replace(/^(poe|tpo)\d+/, "$1"))) return materialLabel(family);
  if (formulation.toLowerCase().startsWith(family.toLowerCase())) return materialLabel(formulation);
  return `${materialLabel(family)} / ${formulation}`;
}

/** Actual recorded lots, including mixtures and missing provenance; never an ordinal subgroup. */
export function figureBatchLabel(batches: Array<string | null | undefined>): string {
  const values = [...new Set(batches.map(batch => {
    const value = batch?.trim().replace(/^#\s*/, "");
    return !value || /^(unknown|inconnu|non renseigné|—)$/i.test(value) ? "non renseigné" : value;
  }))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  return `${values.length > 1 ? "lots" : "lot"} ${values.join(", ") || "non renseigné"}`;
}

export function figureCellLabel(sample: Pick<Sample, "sample_uid" | "sample_id_raw">): string {
  const number = recordedCellNumber(sample);
  return number ? `cellule ${number}` : `cellule non renseignée (identifiant ${sample.sample_uid.replace(/^SMP\d*-/, "")})`;
}

export function figureSpecimenLabel(sample: Sample): string {
  return `${figureFormulationLabel(sample)} — ${figureBatchLabel([sample.batch_no_raw])} · ${figureCellLabel(sample)}`;
}

/** French wording for figures and their captions; analytical keys stay unchanged. */
export function figureMetricLabel(metric: MetricKey): string {
  const pearl = pearlMetric(metric);
  if (pearl) return pearl.figureLabel;
  const labels: Partial<Record<MetricKey, string>> = {
    light_pout_mean_mW_cm2: "Pout (moyenne aller/retour)",
    efficiency_pct: "PCE",
    jsc_mA_cm2: "Jsc",
    voc_V: "Voc",
    ff_pct: "FF",
    outdoor_pr_pct: "PR (médiane journalière)",
    outdoor_pmpp_W: "Pmpp (médiane journalière)",
    outdoor_irradiance_W_m2: "Irradiance (médiane journalière)",
    light_pout_forward_mW_cm2: "Pout (balayage avant)",
    light_pout_reverse_mW_cm2: "Pout (balayage arrière)",
  };
  return labels[metric] ?? metric;
}

export function figureAgeingContext(stress: string): string {
  if (stress === "DH") return "pendant l’essai de Damp Heat (DH)";
  if (stress === "TC") return "pendant l’essai de Thermal Cycling (TC)";
  if (stress === "DH+TC") return "pendant les essais de Damp Heat et de Thermal Cycling (DH+TC)";
  if (stress === "Outdoor") return "en exposition extérieure";
  if (stress === "Light ageing") return "pendant le vieillissement sous lumière";
  return `sous vieillissement ${stress}`;
}

/** Visible figure prose only. Source metadata and archived names remain untouched. */
export function publicationText(text: string): string {
  // Format quantities, not dates, software versions, section numbers or source URLs.
  const numericText = /^[-+−]?\d+\.\d+(?:[eE][-+]?\d+)?$/.test(text.trim()) ? text.replace(".", ",") : text;
  return materialLabel(numericText)
    .replace(/Silicone\s*\/\s*PDMS/g, "PDMS")
    .replace(/\b(?:DNP[- ]?CVF|CVF)\b/gi, "TPO-1")
    .replace(/\bMitsui\b/gi, "POE-1").replace(/\bTF4\b/gi, "POE-2")
    .replace(/\bCybrid(?:\s+T22)?\b/gi, "POE-3").replace(/\bLenzing\b/gi, "TPO-2")
    .replace(/\blight ageing\b/gi, "vieillissement sous lumière")
    .replace(/\bdamp heat\b/gi, "Damp Heat").replace(/\bthermal cycling\b/gi, "Thermal Cycling")
    .replace(/valeur Unaged/g, "valeur initiale après encapsulation")
    .replace(/référence Unaged/g, "référence initiale après encapsulation")
    .replace(/\bUnaged\b/g, "état initial après encapsulation")
    .replace(/(?<![\w./])([-+−]?\d+)\.(\d+)(?=\s*(?:%|°C|mW|mV|mA|cm²|V|W|h|jours?|cycles|sun)(?:$|[\s,.;·)/]))/g, "$1,$2");
}

export function figureTimeUnit(unit: string): string {
  return unit === "days" ? "jours" : unit;
}

/** A cycle counts protocol repetitions; it is not a duration. */
export function figureXAxisLabel(unit: string): string {
  return unit === "cycles" ? "Nombre de cycles" : `Temps (${figureTimeUnit(unit)})`;
}

export function figureStageLabel(stage: "before" | "post" | "after" | "aged"): string {
  if (stage === "before") return "Avant";
  if (stage === "aged") return "Vieilli";
  return "Après";
}
