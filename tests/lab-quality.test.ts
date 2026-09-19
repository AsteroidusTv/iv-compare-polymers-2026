import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import type { IVDataset, Observation } from "../app/lib/iv-data";
import { labObservationEligible, labQualityIssues } from "../app/lib/lab-quality";
import { summarise } from "../app/lib/science";

const row = (id: string, time: number, value: number, extra: Partial<Observation> = {}): Observation => ({ observation_uid: id, sample_uid: "cell", test_type: "DH", exposure_unit: "h", exposure_duration_numeric: time, efficiency_pct: value, ...extra });

test("source flags and detected dropouts are removed before mean/median and restored only explicitly", () => {
  const rows = [row("before", 1, 15), row("zero", 2, 0), row("after", 3, 15.1), row("flag", 2, 500, { sample_uid: "other", data_quality_flag: "bad" }), row("valid", 2, 14, { sample_uid: "third" })];
  const issues = labQualityIssues(rows, "efficiency_pct");
  assert.ok(issues.has("zero"));
  const kept = rows.filter((r) => r.exposure_duration_numeric === 2 && labObservationEligible(r, issues, false));
  for (const method of ["mean", "median"] as const) {
    assert.equal(summarise(kept.map((r) => r.efficiency_pct!), method).value, 14);
    assert.equal(summarise(kept.map((r) => r.efficiency_pct!), method).n, 1);
  }
  assert.equal(rows.filter((r) => labObservationEligible(r, issues, true)).length, rows.length);
  assert.equal(labObservationEligible(row("baseline", 0, 12, { test_type: "Unaged", data_quality_flag: "bad" }), issues, false), false);
});

test("retain sustained, terminal and uncorroborated failures; never compare different cells or protocols", () => {
  for (const rows of [
    [row("a", 1, 15), row("b", 2, 0), row("c", 3, 0)],
    [row("a", 1, 15), row("b", 2, 0)],
    [row("a", 1, 15), row("b", 2, 0), row("c", 3, 15, { sample_uid: "other" })],
    [row("a", 1, 15), row("b", 2, 0), row("c", 3, 15, { test_type: "TC" })],
    [row("a", 1, 15), row("b", 2, 0), row("c", 3, 4)],
  ]) assert.equal(labQualityIssues(rows, "efficiency_pct").size, 0);
});

test("supplied SMP-137 zero is review-flagged but its final degraded measurement remains", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const issues = labQualityIssues(dataset.observations, "efficiency_pct");
  assert.match(issues.get("OBS-0171") ?? "", /dropout/);
  assert.equal(issues.has("OBS-0174"), false);
});

test("implausible unflagged references are ineligible", () => {
  const reference = row("baseline", 0, 500, { test_type: "Unaged" });
  const issues = labQualityIssues([reference], "efficiency_pct");
  assert.equal(labObservationEligible(reference, issues, false), false);
});

test("non-numeric PCE does not exclude valid Jsc/Voc/FF; unknown global QA still does", () => {
  const observation = row("partial", 1, 0, { efficiency_pct: null, jsc_mA_cm2: 22, voc_V: 1, ff_pct: 75, data_quality_flag: "non_numeric_metric:eff" });
  assert.equal(labObservationEligible(observation, labQualityIssues([observation], "efficiency_pct"), false), false);
  for (const metric of ["jsc_mA_cm2", "voc_V", "ff_pct"] as const) {
    assert.equal(labObservationEligible(observation, labQualityIssues([observation], metric), false), true);
    const global = { ...observation, data_quality_flag: "non_numeric_metric:eff; acquisition_invalid" };
    assert.equal(labObservationEligible(global, labQualityIssues([global], metric), false), false);
  }
});
