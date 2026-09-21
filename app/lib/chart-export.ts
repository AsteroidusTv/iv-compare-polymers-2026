export type TrendExportPoint = {
  n: number;
  selectedLabel?: string;
};

export type TrendExportMode = "individual" | "aggregate" | "mixed";

type PlottedTrendPoint = TrendExportPoint & {
  y: number;
  intervalLow: number;
  intervalHigh: number;
  intervalLabel: string;
  members: Array<{ value: number }>;
};

// Rendering and automatic scaling must use the same interval policy. Optional
// mean CIs remain untruncated, including the very imprecise n=2 diagnostic.
export function trendIntervalVisible(point: PlottedTrendPoint, enabled: boolean): boolean {
  return enabled && !point.selectedLabel && ((point.intervalLabel === "95% CI" && point.n >= 2)
    || (point.intervalLabel === "IQR" && point.n >= 3));
}

export function trendDisplayValues(points: PlottedTrendPoint[], intervals: boolean): number[] {
  return points.flatMap(point => [point.y,
    ...(!point.selectedLabel ? point.members.map(member => member.value) : []),
    ...(trendIntervalVisible(point, intervals) ? [point.intervalLow, point.intervalHigh] : []),
  ]).filter(Number.isFinite);
}

export function uniqueLegendEntries<T extends { label: string; exportLegendKey?: string }>(series: T[]): T[] {
  const seen = new Set<string>();
  return series.filter((item) => {
    const key = item.exportLegendKey ?? item.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function describeGraphElectrode(electrodes: Array<string | null | undefined>): string | undefined {
  return electrodes.some((electrode) => electrode?.trim().toLowerCase() === "ag") ? "Ag electrode" : undefined;
}

export function pointsThrough<T extends { x: number }>(points: T[], maximumX: number | null): T[] {
  return maximumX === null ? points : points.filter((point) => point.x <= maximumX);
}

function sampleSizeDescription(points: TrendExportPoint[]): string | null {
  const counts = points.map((point) => point.n).filter((count) => count > 0);
  if (!counts.length) return null;
  const minimum = Math.min(...counts);
  const maximum = Math.max(...counts);
  return minimum === maximum
    ? `n=${minimum} per series and duration`
    : `n=${minimum}–${maximum} per series and duration`;
}

export function describeTrendExport(points: TrendExportPoint[], aggregateDescription?: string): {
  mode: TrendExportMode;
  subtitle: string;
} {
  const individualPoints = points.filter((point) => Boolean(point.selectedLabel));
  const aggregatePoints = points.filter((point) => !point.selectedLabel);

  if (individualPoints.length && !aggregatePoints.length) {
    return { mode: "individual", subtitle: "Individual specimen trajectories · one line per specimen · no aggregation" };
  }

  const sampleSize = sampleSizeDescription(aggregatePoints);
  if (individualPoints.length) {
    const aggregateSummary = [aggregateDescription, sampleSize].filter(Boolean).join("; ");
    return {
      mode: "mixed",
      subtitle: ["Mixed display · individual observations and aggregate values", aggregateSummary ? `aggregates: ${aggregateSummary}` : null]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    mode: "aggregate",
    subtitle: [aggregateDescription, sampleSize].filter(Boolean).join(" · "),
  };
}

export function describeSeriesSelection(points: TrendExportPoint[], mode: TrendExportMode): string | undefined {
  const individualLabels = [...new Set(points.map((point) => point.selectedLabel).filter((label): label is string => Boolean(label)))];
  const hasAggregatePoints = points.some((point) => !point.selectedLabel);

  if (!individualLabels.length) return mode === "mixed" ? "Aggregate values" : undefined;

  const specimen = individualLabels.length === 1
    ? `Individual specimen · ${individualLabels[0]}`
    : `${individualLabels.length} individual specimens`;
  return hasAggregatePoints ? `Mixed selections · ${specimen} + aggregate values` : specimen;
}
