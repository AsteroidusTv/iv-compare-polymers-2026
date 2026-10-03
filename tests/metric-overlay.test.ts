import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricOverlay } from "../app/components/MetricOverlay";
import { synchronizedMetrics } from "../app/lib/synchronized-metrics";
import type { IVDataset } from "../app/lib/iv-data";

test("single-cell overlay keeps each baseline and does not bridge a missing metric", () => {
  const dataset = {samples: [{sample_uid:"a",material_family:"EVA"},{sample_uid:"b",material_family:"EVA"}], observations: [
    {sample_uid:"a",observation_uid:"base",test_type:"Unaged",efficiency_pct:10,jsc_mA_cm2:20,voc_V:1,ff_pct:50},
    ...[100,200,300].map((time,i)=>({sample_uid:"a",observation_uid:`a${i}`,test_type:"DH",exposure_duration_numeric:time,efficiency_pct:i===1?null:9-i,jsc_mA_cm2:18-i,voc_V:1,ff_pct:45-i})),
    {sample_uid:"b",observation_uid:"b0",test_type:"DH",exposure_duration_numeric:150,efficiency_pct:5},
  ]} as IVDataset;
  const analysis = synchronizedMetrics(dataset,{sampleUids:["a"],protocol:"DH",graphEnd:null});
  assert.deepEqual(analysis.times,[100,200,300]);
  assert.equal(analysis.panels[0].cells[0].value,90);
  assert.equal(analysis.panels[1].cells[0].value,90);
  assert.equal(analysis.panels[2].cells[0].value,100);
  const svg = renderToStaticMarkup(createElement("svg",null,createElement(MetricOverlay,{panels:analysis.panels,sampleUid:"a",subtitle:"Cellule a",min:0,max:120,end:300,unit:"h",clipId:"test"})));
  const pce = svg.split('<g aria-label="PCE">')[1].split('<g aria-label="Jsc">')[0];
  assert.equal((pce.match(/<line /g)??[]).length,0,"missing PCE at 200 h breaks both adjacent segments");
  for (const metric of ["PCE","Jsc","Voc","FF"]) assert.ok(svg.includes(`aria-label="${metric}"`));
  for (const dash of ["10 5","3 5","12 4 3 4"]) assert.ok(svg.includes(`stroke-dasharray="${dash}"`));
  assert.ok(!svg.includes("150 h"),"the other cell never contributes");
});
