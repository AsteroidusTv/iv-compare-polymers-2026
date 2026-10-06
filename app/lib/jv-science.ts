import type { IVDataset, Measurement } from "./iv-data";
import { analyzeIVCurve, type IVCurveAnalysis } from "./iv-curve-analysis";
import { evidenceValidated, metricConsistency, type JVMetric } from "./jv-validation";
import { repeatedSegments, REPEAT_RULES, type SegmentInput, type SegmentRepeat } from "./jv-segments";

export const JV_SCIENCE_VERSION = "2.0.0";
type Point = { x: number; y: number };
export interface JVConversion {
  voltageUnit: "V" | "mV";
  currentUnit: "A" | "mA" | "mA/cm2";
  areaCm2?: number;
  photovoltaicSign: 1 | -1;
}
/** Explicit, declared-unit conversion only. Consistency does not establish calibration. */
export function normalizeJVPoints(points: Point[], conversion: JVConversion): Point[] {
  if (!["V", "mV"].includes(conversion.voltageUnit) || !["A", "mA", "mA/cm2"].includes(conversion.currentUnit)) throw new Error("Unknown JV unit");
  if (conversion.photovoltaicSign !== 1 && conversion.photovoltaicSign !== -1) throw new Error("Unknown photovoltaic sign");
  const area = conversion.currentUnit === "mA/cm2" ? 1 : conversion.areaCm2;
  if (!area || !Number.isFinite(area) || area <= 0) throw new Error("A positive documented area is required for current-to-density conversion");
  return points.map(({ x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Non-finite JV point");
    return { x: x * (conversion.voltageUnit === "mV" ? 0.001 : 1), y: y * (conversion.currentUnit === "A" ? 1000 : 1) / area * conversion.photovoltaicSign };
  });
}

export interface JVMetrics {
  jsc_mA_cm2: number | null;
  voc_V: number | null;
  vmpp_V: number | null;
  jmpp_mA_cm2: number | null;
  pmpp_mW_cm2: number | null;
  ff_pct: number | null;
  efficiency_pct: number | null;
  incidentPower_mW_cm2: number | null;
  coverage: "complete" | "incomplete";
}
/** Piecewise-linear measured branch; analytic maximum of V*J on each interval. Never extrapolates. */
export function reconstructJVMetrics(points: Point[], incidentPower_mW_cm2?: number | null): JVMetrics {
  const result: JVMetrics = { jsc_mA_cm2: null, voc_V: null, vmpp_V: null, jmpp_mA_cm2: null, pmpp_mW_cm2: null, ff_pct: null, efficiency_pct: null, incidentPower_mW_cm2: incidentPower_mW_cm2 && incidentPower_mW_cm2 > 0 && Number.isFinite(incidentPower_mW_cm2) ? incidentPower_mW_cm2 : null, coverage: "incomplete" };
  if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return result;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  // Duplicate voltages with differing currents are not a single-valued branch.
  if (sorted.some((p, i) => i > 0 && p.x === sorted[i - 1].x && p.y !== sorted[i - 1].y)) return result;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.x <= 0 && b.x >= 0 && b.x !== a.x) result.jsc_mA_cm2 = a.y + (b.y - a.y) * -a.x / (b.x - a.x);
    if (a.x >= 0 && a.y >= 0 && b.y <= 0 && a.y !== b.y && result.voc_V === null) result.voc_V = a.x - a.y * (b.x - a.x) / (b.y - a.y);
  }
  const zero = sorted.find(p => p.x === 0);
  if (zero) result.jsc_mA_cm2 = zero.y;
  const exactVoc = sorted.find(p => p.x > 0 && p.y === 0);
  if (result.voc_V === null && exactVoc) result.voc_V = exactVoc.x;
  if (result.jsc_mA_cm2 === null || result.jsc_mA_cm2 <= 0 || result.voc_V === null || result.voc_V <= 0) return result;
  let best = { x: 0, y: result.jsc_mA_cm2, power: 0 };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b.x === a.x) continue;
    const lo = Math.max(0, a.x), hi = Math.min(result.voc_V, b.x);
    if (lo > hi) continue;
    const slope = (b.y - a.y) / (b.x - a.x), intercept = a.y - slope * a.x;
    const candidates = [lo, hi];
    if (slope !== 0) { const stationary = -intercept / (2 * slope); if (stationary >= lo && stationary <= hi) candidates.push(stationary); }
    for (const x of candidates) { const y = slope * x + intercept; if (x * y > best.power) best = { x, y, power: x * y }; }
  }
  result.coverage = "complete";
  result.vmpp_V = best.x; result.jmpp_mA_cm2 = best.y; result.pmpp_mW_cm2 = best.power;
  result.ff_pct = 100 * best.power / (result.jsc_mA_cm2 * result.voc_V);
  if (result.incidentPower_mW_cm2 !== null) result.efficiency_pct = 100 * best.power / result.incidentPower_mW_cm2;
  return result;
}

export interface JVSegmentDiagnostic {
  index: number;
  status: "acquired" | "unresolved" | "suspected_export_residue";
  repeatedFileCount: number;
  detection: SegmentRepeat["detection"];
}
export interface JVDiagnostic {
  measurementUid: string;
  analysis: IVCurveAnalysis;
  segments: JVSegmentDiagnostic[];
  instrument: { jsc_mA_cm2: number | null; voc_V: number | null; ff_pct: number | null; efficiency_pct: number | null; pmpp_mW_cm2: number | null };
  reconstructed: JVMetrics;
  currentDensityStatus: "consistent_not_calibrated" | "suspicious_surface_or_units" | "unresolved";
  /** Safe for default exploratory display after automated numerical screening. */
  screeningEligible: boolean;
  quantitativeEligible: boolean;
  validation: { numericallyConsistent: boolean; unitValidated: boolean; rangeValidated: boolean; experimentallyValidated: boolean };
  consistency: ReturnType<typeof metricConsistency>[];
  issues: string[];
  conversion: { voltageUnitInterpretation: string; currentUnitInterpretation: string; surfaceUsed: number | null; conversionApplied: string; conversionConfidence: "documented" | "legacy_unverified" };
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const med = (values: number[]) => { const v = [...values].sort((a, b) => a - b), n = v.length; return n ? (v[Math.floor((n - 1) / 2)] + v[Math.floor(n / 2)]) / 2 : NaN; };
const cache = new WeakMap<IVDataset, ReadonlyMap<string, JVDiagnostic>>();

/** Dataset-level evidence uses distinct source files, not repeated sweeps within a file. */
export function getJVDiagnostics(dataset: IVDataset): ReadonlyMap<string, JVDiagnostic> {
  const cached = cache.get(dataset); if (cached) return cached;
  const analyses = new Map<string, IVCurveAnalysis>();
  const segmentInputs: SegmentInput[] = [];
  const fileSources = new Map(dataset.files.map(f => [f.file_uid, f.source_file || f.file_uid]));
  for (const row of dataset.measurements) {
    const curve = dataset.curves[row.measurement_uid];
    const points = curve ? curve.v.flatMap((x, i) => finite(x) && finite(curve.j[i]) ? [{ x, y: curve.j[i] as number, sourceIndex: i }] : []) : [];
    const analysis = analyzeIVCurve(points, row.voc_V); analyses.set(row.measurement_uid, analysis);
    for (const segment of analysis.segments) segmentInputs.push({ id: `${row.measurement_uid}:${segment.id}`, file: fileSources.get(row.file_uid) || row.file_uid, points: segment.points });
  }
  const repeated = repeatedSegments(segmentInputs);
  const result = new Map<string, JVDiagnostic>();
  for (const row of dataset.measurements) {
    const original = analyses.get(row.measurement_uid)!;
    const segments: JVSegmentDiagnostic[] = original.segments.map((s, index) => {
      const repeat = repeated.get(`${row.measurement_uid}:${s.id}`)!;
      return { index, status: repeat.independentFiles >= REPEAT_RULES.minimumIndependentFiles ? "suspected_export_residue" : evidenceValidated(row.scientific_validation?.range, row.measurement_uid, s.id) ? "acquired" : "unresolved", repeatedFileCount: repeat.independentFiles, detection: repeat.detection };
    });
    // Explicit, targeted acquisition evidence takes precedence; otherwise inspect
    // the first non-residue branch without treating it as acquired.
    const acquiredIndex = original.segments.findIndex((s, i) => s.points.length >= 2 && segments[i].status === "acquired");
    const primaryIndex = acquiredIndex >= 0 ? acquiredIndex : original.segments.findIndex((s, i) => s.points.length >= 2 && segments[i].status !== "suspected_export_residue");
    const analysis = { ...original, primaryIndex, primaryPointCount: original.segments[primaryIndex]?.points.length ?? 0 };
    const reconstructed = reconstructJVMetrics(original.segments[primaryIndex]?.points ?? [], row.incident_power_mW_cm2);
    const instrument = { jsc_mA_cm2: finite(row.jsc_mA_cm2) ? row.jsc_mA_cm2 : null, voc_V: finite(row.voc_V) ? row.voc_V : null, ff_pct: finite(row.ff_pct) ? row.ff_pct : null, efficiency_pct: finite(row.efficiency_pct) ? row.efficiency_pct : null, pmpp_mW_cm2: finite(row.pmpp_mW_cm2) ? row.pmpp_mW_cm2 : null };
    const issues: string[] = [];
    if (segments.some(s => s.status === "suspected_export_residue")) issues.push("Repeated segment across independent files: suspected export residue; excluded from automatic branch selection.");
    if (primaryIndex < 0) issues.push("No non-residue branch available.");
    if (reconstructed.coverage !== "complete") issues.push("Incomplete photovoltaic coverage: no extrapolation; full quantitative metrics unavailable.");
    const consistency = (Object.keys(instrument) as JVMetric[]).map(metric => metricConsistency(metric, instrument[metric], reconstructed[metric]));
    const severe = consistency.filter(check => check.status === "severe_mismatch" || check.status === "physically_inconsistent");
    const currentMismatch = severe.some(check => check.metric === "jsc_mA_cm2");
    for (const check of severe) issues.push(`${check.metric}: ${check.status}; instrument=${check.instrument}, reconstructed=${check.reconstructed}, tolerance=${check.threshold}. No automatic correction.`);
    const numericallyConsistent = reconstructed.coverage === "complete" && severe.length === 0;
    const validation = {
      numericallyConsistent,
      unitValidated: evidenceValidated(row.scientific_validation?.units, row.measurement_uid),
      rangeValidated: primaryIndex >= 0 && evidenceValidated(row.scientific_validation?.range, row.measurement_uid, original.segments[primaryIndex]?.id),
      experimentallyValidated: evidenceValidated(row.scientific_validation?.experiment, row.measurement_uid),
    };
    if (!validation.unitValidated) issues.push("Unit interpretation unresolved: numerical consistency is not unit validation.");
    if (!validation.rangeValidated) issues.push("Acquired range unresolved: a non-repeated branch is not proof of acquisition.");
    if (!validation.experimentallyValidated) issues.push("Experimental validation unresolved.");
    if (row.qa_flags) issues.push(`Source QA: ${row.qa_flags}`);
    const screeningEligible = primaryIndex >= 0 && numericallyConsistent && !row.qa_flags;
    result.set(row.measurement_uid, { measurementUid: row.measurement_uid, analysis, segments, instrument, reconstructed, currentDensityStatus: currentMismatch ? "suspicious_surface_or_units" : reconstructed.jsc_mA_cm2 !== null && instrument.jsc_mA_cm2 !== null ? "consistent_not_calibrated" : "unresolved", screeningEligible, quantitativeEligible: screeningEligible && validation.unitValidated && validation.rangeValidated && validation.experimentallyValidated, validation, consistency, issues,
      conversion: { voltageUnitInterpretation: row.voltage_unit_interpretation || "Pack V; original unit interpretation not recorded", currentUnitInterpretation: row.current_unit_interpretation || "Pack generated mA/cm²; original conversion not independently documented", surfaceUsed: row.cell_area_cm2 ?? null, conversionApplied: row.conversion_applied || "Legacy pack transformation retained, not altered", conversionConfidence: validation.unitValidated ? "documented" : "legacy_unverified" } });
  }
  cache.set(dataset, result); return result;
}

/** Equal specimen weight, with identical physical sweeps deduplicated before within-specimen median. */
export function chooseSpecimenFirstMeasurement(rows: Measurement[], dataset: IVDataset, includeUnsafe = false): Measurement | null {
  const diagnostics = getJVDiagnostics(dataset), groups = new Map<string, Measurement[]>();
  for (const row of rows) {
    if (!row.sample_uid || !finite(row.efficiency_pct) || (!includeUnsafe && !diagnostics.get(row.measurement_uid)?.screeningEligible)) continue;
    const group = groups.get(row.sample_uid) ?? []; group.push(row); groups.set(row.sample_uid, group);
  }
  const candidates = [...groups].map(([uid, entries]) => {
    const unique = new Map<string, Measurement>();
    for (const row of [...entries].sort((a,b) => a.measurement_uid.localeCompare(b.measurement_uid))) {
      const curve = dataset.curves[row.measurement_uid];
      const key = JSON.stringify([row.efficiency_pct, row.jsc_mA_cm2, row.voc_V, row.ff_pct, curve?.v, curve?.j]);
      if (!unique.has(key)) unique.set(key, row);
    }
    const sweeps = [...unique.values()], value = med(sweeps.map(r => r.efficiency_pct!));
    const sweep = sweeps.sort((a,b) => Math.abs(a.efficiency_pct! - value) - Math.abs(b.efficiency_pct! - value) || a.measurement_uid.localeCompare(b.measurement_uid))[0];
    return { uid, value, sweep };
  });
  const center = med(candidates.map(c => c.value));
  return candidates.sort((a,b) => Math.abs(a.value - center) - Math.abs(b.value - center) || a.uid.localeCompare(b.uid))[0]?.sweep ?? null;
}
