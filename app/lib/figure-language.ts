import type { MetricKey } from "./iv-data";

/** French wording for figures and their captions; analytical keys stay unchanged. */
export function figureMetricLabel(metric: MetricKey): string {
  const labels: Record<MetricKey, string> = {
    efficiency_pct: "PCE",
    jsc_mA_cm2: "Jsc",
    voc_V: "Voc",
    ff_pct: "FF",
    outdoor_pr_pct: "PR (médiane journalière)",
    outdoor_pmpp_W: "Pmpp (médiane journalière)",
    outdoor_irradiance_W_m2: "Irradiance (médiane journalière)",
  };
  return labels[metric];
}

export function figureAgeingContext(stress: string): string {
  if (stress === "DH") return "sous chaleur humide (DH)";
  if (stress === "TC") return "sous cycles thermiques (TC)";
  if (stress === "DH+TC") return "sous chaleur humide et cycles thermiques (DH+TC)";
  if (stress === "Outdoor") return "en exposition extérieure";
  return `sous vieillissement ${stress}`;
}

export function figureTimeUnit(unit: string): string {
  return unit === "days" ? "jours" : unit;
}

export function figureStageLabel(stage: "before" | "post" | "after" | "aged"): string {
  if (stage === "before") return "Avant";
  if (stage === "aged") return "Vieilli";
  return "Après";
}
