import test from "node:test";
import assert from "node:assert/strict";
import { synchronizedMetrics } from "../app/lib/synchronized-metrics";
import type { IVDataset } from "../app/lib/iv-data";
test("four panels keep identical cells/times and expose missing metrics without bridging gaps",()=>{
 const dataset={samples:[{sample_uid:"a",material_family:"EVA"},{sample_uid:"b",material_family:"EVA"}],observations:[
 {sample_uid:"a",observation_uid:"p",test_type:"Unaged",efficiency_pct:10,jsc_mA_cm2:20,voc_V:1,ff_pct:50},
 {sample_uid:"a",observation_uid:"q",test_type:"DH",exposure_duration_numeric:100,efficiency_pct:null,jsc_mA_cm2:18,voc_V:1,ff_pct:50,data_quality_flag:"non_numeric_metric:eff"},
 {sample_uid:"a",observation_uid:"r",test_type:"DH",exposure_duration_numeric:200,efficiency_pct:8,jsc_mA_cm2:16,voc_V:1,ff_pct:50},
 ]} as IVDataset;
 const result=synchronizedMetrics(dataset,{sampleUids:["a","b"],protocol:"DH",graphEnd:100});
 for(const panel of result.panels){assert.deepEqual(panel.sampleUids,["a","b"]);assert.deepEqual(panel.times,[100]);assert.equal(panel.cells.length,2);assert.equal(panel.cells[1].value,null);}
 assert.equal(result.panels[0].cells[0].value,null);assert.equal(result.panels[1].cells[0].value,90);
 assert.equal(result.panels[1].traces.length,2,"full selection retains beyond graph end");
 assert.equal(synchronizedMetrics(dataset,{sampleUids:["a","b"],excludedSampleUids:["a"],protocol:"DH",graphEnd:null}).cohort.length,1);
});
