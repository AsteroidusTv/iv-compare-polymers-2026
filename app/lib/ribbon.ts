import type { Sample } from "./iv-data";

export const ALL_RIBBONS = "all";
export const UNKNOWN_RIBBON = "unknown";
const RECORDED_PREFIX = "recorded:";

export function ribbonChoice(value: string): string {
  return `${RECORDED_PREFIX}${value}`;
}

export function ribbonSelectionLabel(selected: string): string {
  if (selected === ALL_RIBBONS) return "Tous les rubans";
  if (selected === UNKNOWN_RIBBON) return "Ruban non renseigné";
  return selected.startsWith(RECORDED_PREFIX) ? `Ruban ${selected.slice(RECORDED_PREFIX.length)}` : "Sélection de ruban inconnue";
}

export function recordedRibbon(sample: Pick<Sample, "ribbon_raw">): string | null {
  return sample.ribbon_raw?.trim() || null;
}

export function ribbonOptions(samples: Pick<Sample, "ribbon_raw">[]): string[] {
  return [...new Set(samples.map(recordedRibbon).filter((value): value is string => value !== null))]
    .sort((left, right) => left.localeCompare(right, "fr", { numeric: true }));
}

export function matchesRibbon(sample: Pick<Sample, "ribbon_raw">, selected: string): boolean {
  if (selected === ALL_RIBBONS) return true;
  const value = recordedRibbon(sample);
  return selected === UNKNOWN_RIBBON ? value === null : selected.startsWith(RECORDED_PREFIX) && value === selected.slice(RECORDED_PREFIX.length);
}

export function ribbonLabel(value: string | null): string {
  return value === null ? "Ruban non renseigné" : `Ruban ${value}`;
}
