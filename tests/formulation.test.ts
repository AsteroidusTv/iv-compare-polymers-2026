import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFormulation, sampleFormulation } from "../app/lib/formulation";
import { analysisGroups } from "../app/lib/cohort";
import { normalizeSeriesConfig, samplesForConfig } from "../app/lib/comparison";
import { encapsulationGroups } from "../app/lib/encapsulation";
import type { IVDataset, Observation, Sample } from "../app/lib/iv-data";

const samples: Sample[] = ["Silicone, 2nd", "Silicone, 3d", "Silicones, 5th"].map((material_raw, i) => ({
  sample_uid: `s${i}`, material_family: "Silicone / PDMS", material_raw, batch_no_raw: `S${i + 2}`,
  electrode: i === 1 ? "Ag" : "Cu", recipe_uid: "R", initial_efficiency_pct: 17,
}));

test("confirmed TF4, CVF and Lenzing aliases share groups and legacy filters", () => {
  const aliases = [
    ["POE-2 / TF4", ["TF4", "POE-2_TF4"]],
    ["TPO-1 / DNP-CVF", ["DNP/CVF", "DNP-CVF 2Ssa", "DNP-CVF(Lisa roll)", "TPO-1_CVF"]],
    ["TPO-2 / Lenzing", ["TPO Lenzing", "Lenzing", "TPO-2_Lenzing"]],
  ] as const;
  for (const [family, names] of aliases) {
    const rows = names.map((raw,i)=>({...samples[0],sample_uid:`alias${i}`,material_family:family,material_raw:raw,batch_no_raw:"A1"}));
    const dataset = {samples:rows,observations:[]} as unknown as IVDataset;
    assert.deepEqual(rows.map(sampleFormulation),names.map(()=>family));
    assert.equal(analysisGroups(rows,"formulation").length,1);
    assert.equal(analysisGroups(rows).length,1);
    assert.equal(analysisGroups([rows[0],{...rows[1],electrode:"Ag"}]).length,2);
    assert.equal(analysisGroups([rows[0],{...rows[1],batch_no_raw:"A2"}]).length,2);
    for (const name of names) {
      const config = {id:"a",material:family,formulation:name,stress:"DH",metric:"efficiency_pct" as const,electrode:"all",recipe:"all"};
      assert.equal(normalizeSeriesConfig(dataset,config).formulation,family);
      assert.equal(samplesForConfig(dataset,config).length,names.length);
    }
    const observations: Observation[] = rows.map(row=>({observation_uid:`o${row.sample_uid}`,sample_uid:row.sample_uid,test_type:"Unaged",efficiency_pct:16}));
    assert.equal(encapsulationGroups(rows,observations,[family]).groups.length,1);
    assert.deepEqual(rows.map(row=>row.material_raw),[...names]);
    assert.equal(canonicalFormulation(family,"unconfirmed variant"),"unconfirmed variant");
  }
  assert.equal(analysisGroups(["EVA 406","EVA 806"].map(raw=>({...samples[0],material_family:"EVA",material_raw:raw})),"formulation").length,2);
});

test("confirmed silicone campaigns are one formulation; source labels remain intact", () => {
  assert.deepEqual(samples.map(sampleFormulation), Array(3).fill("Silicone / PDMS"));
  assert.equal(samples[0].material_raw, "Silicone, 2nd");
  assert.equal(canonicalFormulation("Silicone / PDMS", "New silicone"), "New silicone");
  assert.equal(canonicalFormulation("EVA", "EVA 406"), "EVA 406");
  assert.equal(canonicalFormulation("Silicone / PDMS", null), null);
  assert.equal(analysisGroups(samples, "formulation").length, 1);
  assert.equal(analysisGroups(samples).length, 3);
  assert.equal(analysisGroups([{ ...samples[0], batch_no_raw: "S" }, { ...samples[1], batch_no_raw: "S" }]).length, 2);
});

test("canonical and legacy silicone formulation filters select the confirmed common material", () => {
  const dataset = { samples, observations: [] } as unknown as IVDataset;
  const config = { id: "a", material: "Silicone / PDMS", formulation: "Silicone, 3d", stress: "DH", metric: "efficiency_pct" as const, electrode: "all", recipe: "all" };
  const normalized = normalizeSeriesConfig(dataset, config);
  assert.equal(normalized.formulation, "Silicone / PDMS");
  assert.equal(samplesForConfig(dataset, config).length, 3);
  assert.equal(samplesForConfig(dataset, { ...config, formulation: "Silicone / PDMS" }).length, 3);
  assert.equal(samplesForConfig(dataset, { ...config, batch: "S3" }).length, 1);
});

test("paired plots use canonical silicone names but keep batches and electrodes separate", () => {
  const observations: Observation[] = samples.map(sample => ({ observation_uid: `o${sample.sample_uid}`, sample_uid: sample.sample_uid, test_type: "Unaged", efficiency_pct: 16 }));
  const result = encapsulationGroups(samples, observations, ["Silicone / PDMS"]);
  assert.equal(result.groups.length, 3);
  assert.deepEqual(result.groups.map(group => group.material), Array(3).fill("Silicone / PDMS"));
});
