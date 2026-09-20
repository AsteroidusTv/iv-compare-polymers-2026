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
  validation?: { quantitativeValidated: boolean };
  analysisTrace?: Record<string, import("./normalization-trace").NormalizationTrace[]>;
  missingness?: { seriesId: string; rows: { sampleUid: string; time: number; exclusionReasons: string[] }[] }[];
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
  exclusions?: { seriesId: string; observationId: string; sampleUid: string; reasons: string[] }[];
}
export function figureManifest(input: Omit<FigureManifest, "schemaVersion" | "generatedAt" | "preset">): FigureManifest {
  const exclusions = Object.entries(input.context.analysisTrace ?? {}).flatMap(([seriesId, traces]) => traces.flatMap(trace => {
    const reasons = [...trace.exclusions];
    const time = trace.observation.test_type === "Unaged" ? 0 : trace.observation.exposure_duration_numeric;
    const missingness = input.context.missingness?.find(group => group.seriesId === seriesId)?.rows.find(row => row.sampleUid === trace.observation.sample_uid && row.time === time);
    reasons.push(...(missingness?.exclusionReasons ?? []));
    if (input.analyticLimit.maximumX !== null && typeof time === "number" && time > input.analyticLimit.maximumX) reasons.push("outside_graph_end");
    return reasons.length ? [{seriesId, observationId:trace.observation.observation_uid, sampleUid:trace.observation.sample_uid, reasons:[...new Set(reasons)]}] : [];
  }));
  return { schemaVersion: "iv-compare-figure/1", generatedAt: new Date().toISOString(), preset: "publication-white", ...input, exclusions };
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
    intervals_visible: manifest.intervalsVisible, context: { dataset: manifest.context.dataset, sourceCode: manifest.context.sourceCode,
      filters: manifest.context.filters, qa: manifest.context.qa, normalization: manifest.context.normalization, aggregation: manifest.context.aggregation }, display: manifest.display };
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
    for (const series of manifest.series as CurveSeries[]) for (const segment of series.segments) for (const [pointIndex, point] of segment.points.entries()) {
      const source = manifest.context.seriesMetadata?.[series.id] as { measurement?: import("./iv-data").Measurement; diagnostics?: import("./jv-science").JVDiagnostic; file?: import("./iv-data").IVFile } | undefined;
      const measurement = source?.measurement, diagnostic = source?.diagnostics;
      const segmentIndex = diagnostic?.analysis.segments.findIndex(item => `${measurement?.measurement_uid}-${item.id}` === segment.id) ?? -1;
      rows.push({ ...shared, series_id: series.id, series_label: series.label, color: series.color, line_pattern: series.linePattern,
        sample_uid: measurement?.sample_uid, measurement_uid: measurement?.measurement_uid, file_uid: measurement?.file_uid,
        segment_status: diagnostic?.segments[segmentIndex]?.status ?? "unresolved", point_index: pointIndex, source_point_index: point.sourceIndex,
        V: point.x, J: point.y, unit_interpretation: diagnostic?.conversion, surface_cm2: diagnostic?.conversion.surfaceUsed,
        conversion_status: diagnostic?.conversion.conversionConfidence, QA_status: diagnostic?.issues,
        validation: diagnostic?.validation, protocol: source?.file?.inferred_test_type, time: source?.file?.inferred_exposure_duration,
        series_metadata: manifest.context.seriesMetadata?.[series.id], segment_id: segment.id, primary_segment: segment.isPrimary,
        source_index: point.sourceIndex, x: point.x, plotted_y: point.y,
        plotted_point_inside_viewport: inViewport(point.x, point.y, manifest.viewport) });
    }
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((key) => cell(row[key])).join(","))].join("\r\n");
}

/** Full configured selection before graph end, visual hiding or cohort exclusions. */
export function fullSelectionCsv(context: FigureExportContext): string {
  const columns = ["series_id", "sample_uid", "observation_uid", "protocol", "time", "absolute_value", "normalized_value", "baseline", "rule", "QA_reasons", "initial_exclusions", "raw_observation", "dataset", "source_code"];
  const rows = Object.entries(context.analysisTrace ?? {}).flatMap(([seriesId, traces])=>traces.map(trace=>[
    seriesId, trace.observation.sample_uid, trace.observation.observation_uid, trace.observation.test_type, trace.observation.exposure_duration_numeric,
    trace.absoluteValue, trace.value, trace.baseline, trace.rule, trace.qaReasons, trace.exclusions, trace.observation, context.dataset, context.sourceCode,
  ]));
  return [columns,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
}
