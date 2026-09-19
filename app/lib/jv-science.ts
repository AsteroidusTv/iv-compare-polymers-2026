import type { IVDataset, Measurement } from "./iv-data";
import { analyzeIVCurve, type IVCurveAnalysis } from "./iv-curve-analysis";

export const JV_SCIENCE_VERSION = "1.0.0";
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
  status: "unresolved" | "suspected_export_residue";
  repeatedFileCount: number;
  detection: "none" | "identical_or_near_identical";
}
export interface JVDiagnostic {
  measurementUid: string;
  analysis: IVCurveAnalysis;
  segments: JVSegmentDiagnostic[];
  instrument: { jsc_mA_cm2: number | null; voc_V: number | null; ff_pct: number | null; efficiency_pct: number | null; pmpp_mW_cm2: number | null };
  reconstructed: JVMetrics;
  currentDensityStatus: "consistent_not_calibrated" | "suspicious_surface_or_units" | "unresolved";
  quantitativeEligible: boolean;
  issues: string[];
  conversion: { voltageUnitInterpretation: string; currentUnitInterpretation: string; surfaceUsed: number | null; conversionApplied: string; conversionConfidence: "documented" | "legacy_unverified" };
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const med = (values: number[]) => { const v = [...values].sort((a, b) => a - b), n = v.length; return n ? (v[Math.floor((n - 1) / 2)] + v[Math.floor(n / 2)]) / 2 : NaN; };
const cache = new WeakMap<IVDataset, ReadonlyMap<string, JVDiagnostic>>();
const signature = (points: Point[]) => points.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";");

/** Dataset-level evidence uses distinct source files, not repeated sweeps within a file. */
export function getJVDiagnostics(dataset: IVDataset): ReadonlyMap<string, JVDiagnostic> {
  const cached = cache.get(dataset); if (cached) return cached;
  const analyses = new Map<string, IVCurveAnalysis>();
  const repeated = new Map<string, Set<string>>();
  const fileSources = new Map(dataset.files.map(f => [f.file_uid, f.source_file || f.file_uid]));
  for (const row of dataset.measurements) {
    const curve = dataset.curves[row.measurement_uid];
    const points = curve ? curve.v.flatMap((x, i) => finite(x) && finite(curve.j[i]) ? [{ x, y: curve.j[i] as number }] : []) : [];
    const analysis = analyzeIVCurve(points, row.voc_V); analyses.set(row.measurement_uid, analysis);
    for (const segment of analysis.segments) {
      if (segment.points.length < 10) continue;
      const key = signature(segment.points), sources = repeated.get(key) ?? new Set<string>();
      sources.add(fileSources.get(row.file_uid) || row.file_uid); repeated.set(key, sources);
    }
  }
  const result = new Map<string, JVDiagnostic>();
  for (const row of dataset.measurements) {
    const original = analyses.get(row.measurement_uid)!;
    const segments: JVSegmentDiagnostic[] = original.segments.map((s, index) => {
      const count = s.points.length >= 10 ? repeated.get(signature(s.points))?.size ?? 0 : 0;
      return { index, status: count >= 3 ? "suspected_export_residue" : "unresolved", repeatedFileCount: count, detection: count >= 3 ? "identical_or_near_identical" : "none" };
    });
    // Prefer the first non-residue branch in acquisition order, not imported-Voc resemblance.
    const primaryIndex = original.segments.findIndex((s, i) => s.points.length >= 2 && segments[i].status !== "suspected_export_residue");
    const analysis = { ...original, primaryIndex, primaryPointCount: original.segments[primaryIndex]?.points.length ?? 0 };
    const reconstructed = reconstructJVMetrics(original.segments[primaryIndex]?.points ?? [], row.incident_power_mW_cm2);
    const instrument = { jsc_mA_cm2: finite(row.jsc_mA_cm2) ? row.jsc_mA_cm2 : null, voc_V: finite(row.voc_V) ? row.voc_V : null, ff_pct: finite(row.ff_pct) ? row.ff_pct : null, efficiency_pct: finite(row.efficiency_pct) ? row.efficiency_pct : null, pmpp_mW_cm2: finite(row.pmpp_mW_cm2) ? row.pmpp_mW_cm2 : null };
    const issues: string[] = [];
    if (segments.some(s => s.status === "suspected_export_residue")) issues.push("Repeated segment across independent files: suspected export residue; excluded from automatic branch selection.");
    if (primaryIndex < 0) issues.push("No non-residue branch available.");
    if (reconstructed.coverage !== "complete") issues.push("Incomplete photovoltaic coverage: no extrapolation; full quantitative metrics unavailable.");
    const mismatch = (a: number | null, b: number | null, tolerance: number, floor: number) => a !== null && b !== null && Math.abs(a - b) > Math.max(floor, tolerance * Math.abs(b));
    const currentMismatch = mismatch(reconstructed.jsc_mA_cm2, instrument.jsc_mA_cm2, 0.25, 0.5);
    const voltageMismatch = mismatch(reconstructed.voc_V, instrument.voc_V, 0.1, 0.05);
    const powerMismatch = mismatch(reconstructed.pmpp_mW_cm2, instrument.pmpp_mW_cm2, 0.25, 0.5);
    if (currentMismatch) issues.push("Reconstructed Jsc differs substantially from instrument Jsc; current units/area require adjudication (no automatic rescaling).");
    if (voltageMismatch) issues.push("Reconstructed Voc differs substantially from instrument Voc; voltage interpretation/branch requires adjudication.");
    if (powerMismatch) issues.push("Reconstructed power differs substantially from instrument power.");
    if (row.qa_flags) issues.push(`Source QA: ${row.qa_flags}`);
    result.set(row.measurement_uid, { measurementUid: row.measurement_uid, analysis, segments, instrument, reconstructed, currentDensityStatus: currentMismatch ? "suspicious_surface_or_units" : reconstructed.jsc_mA_cm2 !== null && instrument.jsc_mA_cm2 !== null ? "consistent_not_calibrated" : "unresolved", quantitativeEligible: primaryIndex >= 0 && reconstructed.coverage === "complete" && !currentMismatch && !voltageMismatch && !powerMismatch && !row.qa_flags, issues,
      conversion: { voltageUnitInterpretation: row.voltage_unit_interpretation || "Pack V; original unit interpretation not recorded", currentUnitInterpretation: row.current_unit_interpretation || "Pack generated mA/cm²; original conversion not independently documented", surfaceUsed: row.cell_area_cm2 ?? null, conversionApplied: row.conversion_applied || "Legacy pack transformation retained, not altered", conversionConfidence: row.conversion_applied ? "documented" : "legacy_unverified" } });
  }
  cache.set(dataset, result); return result;
}

/** Equal specimen weight, with identical physical sweeps deduplicated before within-specimen median. */
export function chooseSpecimenFirstMeasurement(rows: Measurement[], dataset: IVDataset, includeUnsafe = false): Measurement | null {
  const diagnostics = getJVDiagnostics(dataset), groups = new Map<string, Measurement[]>();
  for (const row of rows) {
    if (!row.sample_uid || !finite(row.efficiency_pct) || (!includeUnsafe && !diagnostics.get(row.measurement_uid)?.quantitativeEligible)) continue;
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
