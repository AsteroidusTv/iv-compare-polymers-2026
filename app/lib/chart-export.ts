export type TrendExportPoint = {
  n: number;
  selectedLabel?: string;
};

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

// Dense daily curves remain fully sampled; only their decorative symbols are
// suppressed. Every observed point keeps its accessible SVG hit target.
export function showTrendMarkers(xUnit: string, pointCount: number): boolean {
  return xUnit !== "days" || pointCount <= 28;
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
  if (!electrodes.length) return undefined;
  const recorded = [...new Set(electrodes.flatMap((electrode) => {
    const value = electrode?.trim();
    if (!value) return [];
    return [value.toLowerCase() === "ag" ? "Ag" : value.toLowerCase() === "cu" ? "Cu" : value];
  }))].sort((left, right) => left.localeCompare(right, "fr"));
  if (recorded.length === 1 && recorded[0] === "Cu" && electrodes.every((electrode) => electrode?.trim())) return undefined;
  const labels = [...recorded, ...(electrodes.some((electrode) => !electrode?.trim()) ? ["non renseignée"] : [])];
  return `${labels.length === 1 ? "Électrode" : "Électrodes"} ${labels.join(" / ")}`;
}

export function describeTrendElectrodes(points: Array<{ members: Array<{ sampleUid: string }> }>, electrodeBySample: ReadonlyMap<string, string | null | undefined>): string | undefined {
  return describeGraphElectrode(points.flatMap((point) => point.members.map((member) => electrodeBySample.get(member.sampleUid))));
}

export function legendElectrodesByKey<T extends { label: string; exportLegendKey?: string; points: Array<{ members: Array<{ sampleUid: string }> }> }>(series: T[], electrodeBySample: ReadonlyMap<string, string | null | undefined>): Map<string, string | undefined> {
  const pointsByKey = new Map<string, T["points"]>();
  for (const item of series) {
    const key = item.exportLegendKey ?? item.label;
    pointsByKey.set(key, [...(pointsByKey.get(key) ?? []), ...item.points]);
  }
  return new Map([...pointsByKey].map(([key, points]) => [key, describeTrendElectrodes(points, electrodeBySample)]));
}

export function pointsThrough<T extends { x: number }>(points: T[], maximumX: number | null): T[] {
  return maximumX === null ? points : points.filter((point) => point.x <= maximumX);
}

export function describeSeriesSelection(points: TrendExportPoint[]): string | undefined {
  const individualLabels = [...new Set(points.map((point) => point.selectedLabel).filter((label): label is string => Boolean(label)))];
  const aggregateCounts = points.filter((point) => !point.selectedLabel && point.n > 0).map((point) => point.n);
  const minimum = aggregateCounts.reduce((smallest, count) => Math.min(smallest, count), Infinity);
  const maximum = aggregateCounts.reduce((largest, count) => Math.max(largest, count), -Infinity);
  const aggregateSize = aggregateCounts.length ? `n = ${minimum}${minimum === maximum ? "" : `–${maximum}`}` : undefined;

  if (!individualLabels.length) return aggregateSize;
  const specimen = individualLabels.length === 1 ? "Échantillon individuel" : `${individualLabels.length} échantillons individuels`;
  return aggregateSize ? `${specimen} · agrégat ${aggregateSize}` : specimen;
}

export function legendSelectionsByKey<T extends { label: string; exportLegendKey?: string; points: TrendExportPoint[] }>(series: T[]): Map<string, string | undefined> {
  const pointsByKey = new Map<string, TrendExportPoint[]>();
  for (const item of series) {
    const key = item.exportLegendKey ?? item.label;
    pointsByKey.set(key, [...(pointsByKey.get(key) ?? []), ...item.points]);
  }
  return new Map([...pointsByKey].map(([key, points]) => [key, describeSeriesSelection(points)]));
}

export function trendExportScaleWarning(clippedY: boolean, showIntervals: boolean): string {
  if (!clippedY) return "";
  return showIntervals ? "Valeurs ou intervalles hors de l’axe vertical" : "Valeurs hors de l’axe vertical";
}
