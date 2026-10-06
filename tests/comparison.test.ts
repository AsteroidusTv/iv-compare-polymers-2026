import assert from "node:assert/strict";
import test from "node:test";

import { createInitialSeries, normalizeSeriesConfig, samplesForConfig, seriesSamplePasses } from "../app/lib/comparison";
import type { IVDataset } from "../app/lib/iv-data";

test("initial comparison selects all metadata explicitly; analysis grouping is a separate concern", () => {
  const dataset = {
    samples: [
      { sample_uid: "A-CU", material_family: "POE-1 / Mitsui", electrode: "Cu" },
      { sample_uid: "A-AG", material_family: "POE-1 / Mitsui", electrode: "Ag" },
      { sample_uid: "B-CU", material_family: "POE-2 / TF4", electrode: "Cu" },
    ],
    observations: [
      { observation_uid: "OA", sample_uid: "A-CU", test_type: "DH", efficiency_pct: 10 },
      { observation_uid: "OB", sample_uid: "B-CU", test_type: "DH", efficiency_pct: 11 },
    ],
  } as IVDataset;
  const series = createInitialSeries(dataset);
  assert.deepEqual(series.map((item) => item.electrode), ["all", "all"]);
  assert.deepEqual(series.map((item) => item.recipe), ["all", "all"]);
  assert.equal(seriesSamplePasses(dataset, dataset.samples[1].sample_uid, series[0]), true);
});

test("formulation, batch, recipe and electrode are real filters and remain selected", () => {
  const dataset = { samples: [
    { sample_uid: "a", material_family: "EVA", material_raw: "406", batch_no_raw: "A1", electrode: "Cu", recipe_uid: "R1" },
    { sample_uid: "b", material_family: "EVA", material_raw: "806", batch_no_raw: "A2", electrode: "Ag", recipe_uid: "R2" },
  ], observations: [] } as unknown as IVDataset;
  const config = { id: "a", material: "EVA", stress: "DH", metric: "efficiency_pct" as const, formulation: "806", batch: "A2", recipe: "R2", electrode: "Ag" };
  assert.deepEqual(samplesForConfig(dataset, config).map((s) => s.sample_uid), ["b"]);
  const normalized = normalizeSeriesConfig(dataset, config);
  assert.equal(normalized.electrode, "Ag");
  assert.equal(normalized.recipe, "R2");
  assert.equal(normalized.formulation, "806");
  assert.equal(normalized.batch, "A2");
  assert.equal(samplesForConfig(dataset, { ...config, batch: "unknown" }).length, 0);
});
