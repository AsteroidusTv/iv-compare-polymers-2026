import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

test("September IV links are unique, stage-consistent and supported by measured PCE", async () => {
  const dataset = JSON.parse(gunzipSync(await readFile("public/data/iv-compare-dowsil.ivpack")).toString());
  const observations = new Map(dataset.observations.map((row: { observation_uid: string }) => [row.observation_uid, row]));
  const samples = new Map(dataset.samples.map((row: { sample_uid: string }) => [row.sample_uid, row]));
  const provisional = dataset.files.filter((row: { match_status: string }) => row.match_status === "matched_filename");
  assert.equal(provisional.length, 38);
  assert.equal(dataset.files.filter((row: { source_file: string; match_status: string }) => row.source_file.includes("260909 - Red box") && row.match_status === "reference_unassigned").length, 12);
  assert.equal(dataset.files.filter((row: { file_uid: string; match_status: string }) => Number(row.file_uid.slice(4)) >= 410 && row.match_status === "unmatched").length, 9);
  for (const file of provisional) {
    const observation = observations.get(file.matched_observation_uid) as { sample_uid: string; test_type: string; exposure_duration_numeric: number | null; efficiency_pct: number | null } | undefined;
    assert.ok(observation, file.source_file);
    assert.equal(observation.sample_uid, file.sample_uid, file.source_file);
    assert.ok(samples.has(file.sample_uid), file.source_file);
    assert.equal(observation.test_type, file.inferred_test_type, file.source_file);
    if (file.inferred_test_type !== "Unaged") assert.equal(observation.exposure_duration_numeric, file.inferred_exposure_duration, file.source_file);
    assert.ok(observation.efficiency_pct !== null, file.source_file);
    const measurements = dataset.measurements.filter((row: { file_uid: string; efficiency_pct: number | null }) => row.file_uid === file.file_uid && row.efficiency_pct !== null);
    assert.ok(measurements.length > 0, file.source_file);
    assert.ok(Math.min(...measurements.map((row: { efficiency_pct: number }) => Math.abs(row.efficiency_pct - observation.efficiency_pct!))) <= 0.5, file.source_file);
  }
});

test("the shipped Outdoor sensitivity bundle recognizes the new main package", async () => {
  const bytes = await readFile("public/data/iv-compare-dowsil.ivpack");
  const bundle = JSON.parse(gunzipSync(await readFile("public/data/outdoor-sensitivity-v1.ivpack")).toString());
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.ok(bundle.compatiblePackageHashes.includes(hash));
});
