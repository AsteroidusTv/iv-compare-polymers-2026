import type { SeriesConfig } from "./comparison";
import { pearlMetric } from './light-ageing-metrics';

export type TrendArrangement = "metric" | "material" | "series";
export type TrendColumns = "auto" | "one" | "two";

interface LayoutSeries {
  id: string;
  parentSeriesId?: string;
  config: SeriesConfig;
  xUnit: string;
  yUnit: string;
}

/** Presentation only: retain series, contributors and input ordering within each panel. */
export function arrangeTrendPanels<T extends LayoutSeries>(series: T[], arrangement: TrendArrangement): { key: string; series: T[] }[] {
  const panels = new Map<string, { key: string; series: T[] }>();
  for (const item of series) {
    // Pair directions of one quantity only: Voc and Vmpp must not mix despite identical units.
    const metricAxis = arrangement === "material"
      ? pearlMetric(item.config.metric)?.family ?? item.config.metric : item.config.metric;
    const key = JSON.stringify([item.config.stress, metricAxis, item.xUnit, item.yUnit,
      ...(arrangement === "material" ? [item.config.material] : []),
      ...(arrangement === "series" ? [item.parentSeriesId ?? item.config.id] : []),
    ]);
    const panel = panels.get(key) ?? { key, series: [] };
    panel.series.push(item);
    panels.set(key, panel);
  }
  return [...panels.values()];
}
