import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { IVDataset, Measurement } from "../app/lib/iv-data";
import { readPack, datasetPackageHash } from "../app/lib/iv-data";
import { createHash } from "node:crypto";
import { normalizeJVPoints, reconstructJVMetrics, getJVDiagnostics, chooseSpecimenFirstMeasurement } from "../app/lib/jv-science";

const points = Array.from({ length: 121 }, (_, i) => ({ x: -0.1 + i / 100, y: 20 * (1.1 - i / 100) }));
test("package provenance hashes exact imported bytes, not a claimed embedded hash", async () => {
  const bytes = readFileSync(new URL("../public/data/iv-compare-dowsil.ivpack", import.meta.url));
  const dataset = await readPack(new Blob([bytes]));
  assert.equal(datasetPackageHash(dataset), createHash("sha256").update(bytes).digest("hex"));
});
test("explicit units and areas yield the same physical JV without guessed surface corrections", () => {
  for (const area of [1, 0.1, 0.25]) for (const unit of ["A", "mA", "mA/cm2"] as const) {
    const voltageUnit = unit === "A" ? "V" : "mV";
    const raw = points.map(p => ({ x: p.x * (voltageUnit === "mV" ? 1000 : 1), y: -p.y * (unit === "mA/cm2" ? 1 : area) / (unit === "A" ? 1000 : 1) }));
    const metrics = reconstructJVMetrics(normalizeJVPoints(raw, { voltageUnit, currentUnit: unit, areaCm2: area, photovoltaicSign: -1 }), 100);
    assert.ok(Math.abs(metrics.jsc_mA_cm2! - 20) < 1e-10);
    assert.ok(Math.abs(metrics.voc_V! - 1) < 1e-10);
    assert.ok(Math.abs(metrics.vmpp_V! - 0.5) < 1e-10);
    assert.ok(Math.abs(metrics.pmpp_mW_cm2! - 5) < 1e-10);
    assert.ok(Math.abs(metrics.ff_pct! - 25) < 1e-10);
    assert.ok(Math.abs(metrics.efficiency_pct! - 5) < 1e-10);
  }
  assert.throws(() => normalizeJVPoints(points, { voltageUnit: "V", currentUnit: "A", photovoltaicSign: 1 }));
});
test("truncated coverage never extrapolates and efficiency needs explicit incident power", () => {
  assert.equal(reconstructJVMetrics(points).efficiency_pct, null);
  const truncated = reconstructJVMetrics(points.filter(p => p.x < 0.8), 100);
  assert.equal(truncated.voc_V, null); assert.equal(truncated.ff_pct, null); assert.equal(truncated.pmpp_mW_cm2, null);
});

function fixture(): IVDataset {
  const measurements = [1, 2, 3].map(i => ({ measurement_uid: `M${i}`, file_uid: `F${i}`, sample_uid: `S${i}`, match_status: "matched_high", efficiency_pct: i * 5, jsc_mA_cm2: 20, voc_V: 1 }));
  return { schemaVersion: "1.2", name: "test", samples: [], recipes: [], observations: [], files: measurements.map(m => ({ file_uid: m.file_uid, source_file: m.file_uid, match_status: "matched_high" })), measurements, curves: Object.fromEntries(measurements.map(m => [m.measurement_uid, { v: points.map(p => p.x), j: points.map(p => p.y) }])), report: { samples: 0, recipes: 0, observations: 0, files: 3, measurements: 3, points: 363, matchedFiles: 3, reviewFiles: 0 } };
}
test("repeated branch across files is suspicious, not automatically acquired or selected", () => {
  const dataset = fixture();
  for (const diagnostic of getJVDiagnostics(dataset).values()) {
    assert.equal(diagnostic.segments[0].status, "suspected_export_residue");
    assert.equal(diagnostic.analysis.primaryIndex, -1);
    assert.equal(diagnostic.screeningEligible, false);
    assert.equal(diagnostic.quantitativeEligible, false);
  }
});
test("specimen-first selection invariant to twenty duplicate sweeps", () => {
  const dataset = fixture();
  const selected = chooseSpecimenFirstMeasurement(dataset.measurements, dataset, true);
  assert.equal(selected?.sample_uid, "S2");
  const copies: Measurement[] = Array.from({ length: 20 }, (_, i) => ({ ...dataset.measurements[0], measurement_uid: `copy${i}` }));
  for (const copy of copies) dataset.curves[copy.measurement_uid] = dataset.curves.M1;
  assert.equal(chooseSpecimenFirstMeasurement([...dataset.measurements, ...copies], dataset, true)?.sample_uid, "S2");
});
test("audited real sweeps: April17 ambiguity and residue-selected MEA-00564/00566 stay excluded", () => {
  const bytes = readFileSync(new URL("../public/data/iv-compare-dowsil.ivpack", import.meta.url));
  const dataset = JSON.parse(gunzipSync(bytes).toString()) as IVDataset;
  const diagnostics = getJVDiagnostics(dataset);
  for (const id of ["MEA-00564", "MEA-00566"]) {
    const diagnostic = diagnostics.get(id)!;
    assert.ok(diagnostic, id);
    assert.ok(diagnostic.segments.some(s => s.status === "suspected_export_residue"));
    assert.equal(diagnostic.quantitativeEligible, false);
    if (diagnostic.analysis.primaryIndex >= 0) assert.notEqual(diagnostic.segments[diagnostic.analysis.primaryIndex].status, "suspected_export_residue");
  }
  const mismatches = [...diagnostics.values()].filter(d => d.currentDensityStatus === "suspicious_surface_or_units");
  assert.ok(mismatches.length >= 138);
  assert.ok(mismatches.every(d => !d.quantitativeEligible));
  const smallAreaConsistent = dataset.measurements.filter(m => m.cell_area_cm2 === 0.1 && diagnostics.get(m.measurement_uid)?.validation.numericallyConsistent);
  assert.ok(smallAreaConsistent.length > 0, "0.1 cm² alone must not imply numerical inconsistency");
  assert.ok([...diagnostics.values()].every(d => !d.quantitativeEligible), "Legacy metadata supplies no experimental validation");
  assert.equal([...diagnostics.values()].filter(d => d.screeningEligible).length, 5408, "Numerically coherent curves should remain visible for cautious comparison");
});

test("legacy conversion text and numerical consistency never confer validation", () => {
  const dataset = fixture();
  dataset.measurements = [dataset.measurements[0]];
  dataset.measurements[0].conversion_applied = "density conversion";
  const diagnostic = getJVDiagnostics(dataset).get("M1")!;
  assert.equal(diagnostic.validation.numericallyConsistent, true);
  assert.equal(diagnostic.validation.unitValidated, false);
  assert.equal(diagnostic.conversion.conversionConfidence, "legacy_unverified");
  assert.equal(diagnostic.validation.rangeValidated, false);
  assert.equal(diagnostic.validation.experimentallyValidated, false);
  assert.equal(diagnostic.screeningEligible, true);
  assert.equal(diagnostic.quantitativeEligible, false);
});

test("quantitative eligibility requires targeted evidence for all validation levels", () => {
  const dataset = fixture();
  dataset.measurements = [dataset.measurements[0]];
  const evidence = { status: "validated" as const, measurement_uid: "M1", source: "synthetic test protocol", reason: "known synthetic units and acquisition", version: "test-1", segment_id: "segment-1" };
  dataset.measurements[0].scientific_validation = { units: evidence, range: evidence, experiment: evidence };
  assert.equal(getJVDiagnostics(dataset).get("M1")!.screeningEligible, true);
  assert.equal(getJVDiagnostics(dataset).get("M1")!.quantitativeEligible, true);
  const mismatch = structuredClone(dataset);
  mismatch.measurements[0].scientific_validation!.range = { ...evidence, segment_id: "another-segment" };
  assert.equal(getJVDiagnostics(mismatch).get("M1")!.quantitativeEligible, false);
});

test("missing JV values do not renumber original source point indices", () => {
  const dataset = fixture();
  dataset.measurements = [dataset.measurements[0]];
  dataset.curves.M1.j[4] = null;
  const diagnostic = getJVDiagnostics(dataset).get("M1")!;
  assert.equal(diagnostic.analysis.segments[0].points[4].sourceIndex, 5);
});
