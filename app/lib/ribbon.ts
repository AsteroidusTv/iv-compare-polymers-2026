import type { Sample } from "./iv-data";

export const ALL_RIBBONS = "all";
export const STANDARD_RIBBON = "standard";
const RECORDED_PREFIX = "recorded:";
const STANDARD_PREPARATION_NOTES = new Set(["stand", "too short", "facing down", "all the length"]);

export function ribbonChoice(value: string): string {
  return `${RECORDED_PREFIX}${value}`;
}

export function ribbonSelectionLabel(selected: string): string {
  if (selected === ALL_RIBBONS) return "Tous les rubans";
  if (selected === STANDARD_RIBBON) return "Ruban standard";
  return selected.startsWith(RECORDED_PREFIX) ? `Ruban ${selected.slice(RECORDED_PREFIX.length)}` : "Sélection de ruban inconnue";
}

// The source column mixes ribbon references with preparation notes. Keep the
// original value in sample.ribbon_raw; only this analytical type is grouped.
export function recordedRibbon(sample: Pick<Sample, "ribbon_raw">): string | null {
  const raw = sample.ribbon_raw?.trim() || null;
  return raw && !STANDARD_PREPARATION_NOTES.has(raw.toLowerCase()) ? raw : null;
}

export function ribbonOptions(samples: Pick<Sample, "ribbon_raw">[]): string[] {
  return [...new Set(samples.map(recordedRibbon).filter((value): value is string => value !== null))]
    .sort((left, right) => left.localeCompare(right, "fr", { numeric: true }));
}

export function matchesRibbon(sample: Pick<Sample, "ribbon_raw">, selected: string): boolean {
  if (selected === ALL_RIBBONS) return true;
  const value = recordedRibbon(sample);
  return selected === STANDARD_RIBBON ? value === null : selected.startsWith(RECORDED_PREFIX) && value === selected.slice(RECORDED_PREFIX.length);
}

export function ribbonLabel(value: string | null): string {
  return value === null ? "Ruban standard" : `Ruban ${value}`;
}
