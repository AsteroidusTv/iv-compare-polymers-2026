import type { CurveSeries, TrendSeries } from "../components/Charts";

/** Caller-owned scientific context; chart-owned limits and points are never inferred from it. */
export interface FigureExportContext {
  dataset?: unknown;
  filters?: unknown;
  qa?: unknown;
  normalization?: unknown;
  aggregation?: unknown;
  cohort?: unknown;
  seriesMetadata?: Record<string, unknown>;
  sourceCode?: unknown;
  [key: string]: unknown;
}
export interface FigureBounds { xMin: number; xMax: number; yMin: number; yMax: number }
export interface FigureManifest {
  schemaVersion: "iv-compare-figure/1";
  generatedAt: string;
  kind: "trend" | "jv";
  title: string;
  caption: string;
  context: FigureExportContext;
  xUnit: string;
  yUnit: string;
  analyticLimit: { maximumX: number | null; interpolation: "none" };
  viewport: FigureBounds;
  intervalsVisible: boolean;
  preset: "publication-white";
  series: TrendSeries[] | CurveSeries[];
  display: Record<string, unknown>;
}
export function figureManifest(input: Omit<FigureManifest, "schemaVersion" | "generatedAt" | "preset">): FigureManifest {
  return { schemaVersion: "iv-compare-figure/1", generatedAt: new Date().toISOString(), preset: "publication-white", ...input };
}
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(value)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function inViewport(x: number, y: number, bounds: FigureBounds): boolean {
  return x >= bounds.xMin && x <= bounds.xMax && y >= bounds.yMin && y <= bounds.yMax;
}
/** Exports analytical plotted data, retaining clipped points explicitly marked as such. */
export function figureCsv(manifest: FigureManifest): string {
  const shared = { figure_kind: manifest.kind, x_unit: manifest.xUnit, y_unit: manifest.yUnit,
    analytic_maximum_x: manifest.analyticLimit.maximumX, viewport: manifest.viewport,
    intervals_visible: manifest.intervalsVisible, context: manifest.context, display: manifest.display };
  const rows: Record<string, unknown>[] = [];
  if (manifest.kind === "trend") {
    for (const series of manifest.series as TrendSeries[]) for (const point of series.points) {
      if (manifest.analyticLimit.maximumX !== null && point.x > manifest.analyticLimit.maximumX) continue;
      const common = { ...shared, series_id: series.id, series_label: series.label, color: series.color, line_pattern: series.linePattern,
        x: point.x, plotted_y: point.y, n: point.n, minimum: point.min, maximum: point.max,
        interval_low: point.intervalLow, interval_high: point.intervalHigh, interval_method: point.intervalLabel,
        plotted_point_inside_viewport: inViewport(point.x, point.y, manifest.viewport), point_metadata: point };
      if (!point.members.length) rows.push(common);
      for (const member of point.members) rows.push({ ...common, observation_id: member.observationId, sample_uid: member.sampleUid,
        sample_label: member.sampleLabel, sample_reference: member.sampleReference, batch: member.batchNo,
        contributing_value: member.value, member_metadata: member });
    }
  } else {
    for (const series of manifest.series as CurveSeries[]) for (const segment of series.segments) for (const point of segment.points) {
      rows.push({ ...shared, series_id: series.id, series_label: series.label, color: series.color, line_pattern: series.linePattern,
        series_metadata: manifest.context.seriesMetadata?.[series.id], segment_id: segment.id, primary_segment: segment.isPrimary,
        source_index: point.sourceIndex, x: point.x, plotted_y: point.y,
        plotted_point_inside_viewport: inViewport(point.x, point.y, manifest.viewport) });
    }
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((key) => cell(row[key])).join(","))].join("\r\n");
}
