export type TrendDisplay = "aggregate" | "samples";
export type TrendAggregationOverrides = Record<string, boolean>;

export function validTrendAggregationOverrides(value: unknown): value is TrendAggregationOverrides {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length <= 8
    && Object.entries(value).every(([id, enabled]) => /^(?:[a-h]|s\d{1,6})$/.test(id) && typeof enabled === "boolean");
}

/** Overrides belong to a stable comparison-series ID, not its position or material name. */
export function resolveTrendDisplays(ids: string[], defaultDisplay: TrendDisplay, overrides: TrendAggregationOverrides): Record<string, TrendDisplay> {
  return Object.fromEntries(ids.map(id => [id, Object.hasOwn(overrides, id)
    ? overrides[id] ? "aggregate" : "samples"
    : defaultDisplay]));
}

export function trendDisplaySummary(displays: Record<string, TrendDisplay>, fallback: TrendDisplay): TrendDisplay | "mixed" {
  const modes = new Set(Object.values(displays));
  return modes.size > 1 ? "mixed" : modes.values().next().value ?? fallback;
}

export function constantCohortApplies(display: TrendDisplay, cohortMode: "available" | "constant"): boolean {
  return display === "aggregate" && cohortMode === "constant";
}

export function mixedTrendDisplayLabel(series: { displayMode?: TrendDisplay }[], method: "mean" | "median"): string {
  const individuals = series.filter(item => item.displayMode === "samples").length;
  const summaries = series.filter(item => item.displayMode === "aggregate").length;
  return `${individuals} individual ${individuals === 1 ? "trajectory" : "trajectories"} + ${summaries} ${method} ${summaries === 1 ? "summary" : "summaries"}`;
}

/** Include either the individual curves or the summaries for each parent, never both. */
export function selectDisplayedTrendSeries<T extends { parentSeriesId?: string }>(
  ids: string[], displays: Record<string, TrendDisplay>, samples: T[], aggregates: T[],
): T[] {
  return ids.flatMap(id => (displays[id] === "aggregate" ? aggregates : samples).filter(series => series.parentSeriesId === id));
}
