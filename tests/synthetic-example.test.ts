import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importDatasetFiles } from "../app/lib/iv-data";
import { encapsulationGroups } from "../app/lib/encapsulation";
import { stagedAgeing } from "../app/lib/staged-ageing";

test("the documented synthetic package imports and supplies complete paired/staged groups", async () => {
  const bytes = readFileSync(new URL("../examples/synthetic-ageing.ivpack", import.meta.url));
  const dataset = await importDatasetFiles([new File([bytes], "synthetic-ageing.ivpack")]);
  assert.match(dataset.name, /SYNTHETIC/);
  assert.equal(dataset.samples.length, 6);
  assert.equal(dataset.observations.length, 18);
  assert.equal(dataset.measurements.length, 0);
  assert.deepEqual(dataset.curves, {});
  const materials = [...new Set(dataset.samples.map(sample => sample.material_family))];
  const paired = encapsulationGroups(dataset.samples, dataset.observations, materials);
  assert.equal(paired.groups.length, 2);
  assert.deepEqual(paired.groups.map(group => group.pairs.length), [3, 3]);
  const staged = stagedAgeing(dataset, { sampleUids: dataset.samples.map(sample => sample.sample_uid), protocol: "DH", aged: { mode: "exact", time: 500 } });
  assert.deepEqual(staged.counts, { before: 6, post: 6, aged: 6 });
  assert.deepEqual(staged.commonTimes, [100, 500]);
  assert.ok(staged.rows.every(row => row.retention !== null && Math.abs(row.retention - 80) < 0.1));
});
