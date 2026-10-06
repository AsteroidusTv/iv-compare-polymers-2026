import type { MetricKey, Sample } from "./iv-data";
import { sampleFormulation } from "./formulation";
import { pearlMetric } from "./light-ageing-metrics";

/** Publication wording only: never replace recorded identities or grouping keys. */
export function figureFormulationLabel(sample: Pick<Sample, "material_family" | "material_raw">): string {
  const family = sample.material_family;
  const formulation = sampleFormulation(sample)?.trim();
  if (!formulation || formulation === family) return family;
  // These family labels already identify the numbered formulation and supplier.
  const normalized = formulation.toLowerCase().replace(/[^a-z0-9]/g, "");
  const familyNormalized = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/^(POE|TPO)-\d+\s*\//.test(family) && (familyNormalized.endsWith(normalized)
    || normalized === familyNormalized.replace("dnp", "")
    || normalized === familyNormalized.replace(/^(poe|tpo)\d+/, "$1"))) return family;
  if (formulation.toLowerCase().startsWith(family.toLowerCase())) return formulation;
  return `${family} / ${formulation}`;
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
  if (stress === "DH") return "pendant l’essai de damp heat (DH)";
  if (stress === "TC") return "pendant l’essai de thermal cycling (TC)";
  if (stress === "DH+TC") return "pendant les essais de damp heat et de thermal cycling (DH+TC)";
  if (stress === "Outdoor") return "en exposition extérieure";
  if (stress === "Light ageing") return "pendant le vieillissement sous lumière";
  return `sous vieillissement ${stress}`;
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
