import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendChart, type TrendSeries } from "../app/components/Charts";
import { DEFAULT_FIGURE_PRESENTATION as defaults, figureFonts, publicationLegendColumns, validFigurePresentation, wrapFigureText } from "../app/lib/figure-presentation";
import { figureSpecimenLabels, persistentZeroNotes, publicationTrendSeries, ribbonLabelsDistinguish } from "../app/lib/figure-legend";
import { publicationText, figureCellLabel } from "../app/lib/figure-language";
import { figureNumber } from "../app/lib/chart-number-format";
import { specimenStylesById } from "../app/lib/material-style";
import type { Sample } from "../app/lib/iv-data";
import { describeSeriesSelection, legendElectrodesByKey } from "../app/lib/chart-export";

const sample = (uid:string, number:string, batch="A4", family="POE-2 / TF4"): Sample => ({sample_uid:uid,sample_id_raw:`${number}_R19`,batch_no_raw:batch,material_family:family,material_raw:family,electrode:"Cu"});
const trend = (cell:Sample, values=[100,90]): TrendSeries => ({id:cell.sample_uid,label:cell.sample_uid,color:"#0072B2",exportLabel:"POE-2 — lot A4",exportLegendKey:"one-material",linePattern:"8 4",points:values.map((value,i)=>({x:i,y:value,n:1,min:value,max:value,intervalLow:value,intervalHigh:value,intervalLabel:"single value",selectedLabel:cell.sample_id_raw!,members:[{observationId:`${cell.sample_uid}-${i}`,sampleUid:cell.sample_uid,sampleLabel:cell.sample_id_raw!,sampleReference:cell.sample_id_raw!,value}]}))});

test("publication settings reject malformed persisted values and default to cell identities",()=>{
  assert.ok(validFigurePresentation(defaults));
  assert.equal(defaults.legendMode,"cells");
  for(const v of [null,{}, {...defaults,textSize:"tiny"},{...defaults,legendColumns:"10"}]) assert.ok(!validFigurePresentation(v));
  assert.ok(figureFonts({...defaults,textSize:"large"}).legend>figureFonts(defaults).legend);
});
test("publication prose removes suppliers, translates references and uses decimal commas without corrupting AM1.5G",()=>{
  assert.equal(publicationText("Mitsui · TF4 · Cybrid T22 · DNP-CVF · Lenzing"),"POE-1 · POE-2 · POE-3 · TPO-1 · TPO-2");
  assert.equal(publicationText("Rétention (% de la valeur Unaged)"),"Rétention (% de la valeur initiale après encapsulation)");
  assert.equal(publicationText("AM1.5G · 98.25 %"),"AM1.5G · 98,25 %");
  assert.equal(publicationText("12.10.2026 · §4.5 · version 1.2 · https://example.org/10.1000"),"12.10.2026 · §4.5 · version 1.2 · https://example.org/10.1000");
  assert.equal(publicationText("-0.0012"),"-0,0012");
  assert.equal(figureNumber(98.25),"98,25");
});
test("each individual curve has a distinct lot/cell legend without changing analytical points",()=>{
  const cells=[sample("a","1"),sample("b","2"),sample("c","3")],series=cells.map(cell=>trend(cell));
  const original=JSON.stringify(series);
  const out=publicationTrendSeries(series,cells,defaults);
  assert.deepEqual(out.map(s=>s.exportLabel),["POE-2 — lot A4 · cellule 1","POE-2 — lot A4 · cellule 2","POE-2 — lot A4 · cellule 3"]);
  assert.equal(new Set(out.map(s=>s.exportLegendKey)).size,3);
  out.forEach((s,i)=>assert.equal(s.points,series[i].points));
  assert.equal(JSON.stringify(series),original);
  assert.equal(publicationTrendSeries(series,cells,{...defaults,legendMode:"materials"}),series);
});
test("recorded lots and sweep direction distinguish curves; duplicate cell names remain explicit",()=>{
  const cells=[sample("a","2","4","TPO-2 / Lenzing"),sample("b","2","TPO_SL","TPO-2 / Lenzing")];
  const series=cells.map(cell=>({...trend(cell),exportLabel:"TPO-2 · retour"}));
  assert.deepEqual(publicationTrendSeries(series,cells,defaults).map(s=>s.exportLabel),["TPO-2 — lot 4 · cellule 2 · retour","TPO-2 — lot TPO_SL · cellule 2 · retour"]);
  const duplicates=figureSpecimenLabels([cells[0],{...cells[0],sample_uid:"other"}]);
  assert.equal(new Set(duplicates.values()).size,2);
  assert.match(figureCellLabel({sample_uid:"SMP-137",sample_id_raw:null}),/cellule non renseignée \(identifiant 137\)/);
  assert.equal(figureCellLabel({sample_uid:"SMP-137",sample_id_raw:"700-1"}),"cellule 1");
});
test("styles identify same-family cells and remain stable when input order changes",()=>{
  const cells=Array.from({length:9},(_,i)=>sample(`SMP-${i}`,String(i+1)));
  const styles=specimenStylesById(cells),reversed=specimenStylesById([...cells].reverse());
  for(const cell of cells) assert.deepEqual(styles.get(cell.sample_uid),reversed.get(cell.sample_uid));
  assert.equal(new Set([...styles.values()].map(s=>`${s.dash}:${s.marker}`)).size,cells.length);
  assert.ok([...styles.values()].every(s=>s.color==="#0072B2"));
  const eva=[{...sample("eva1","1","A1","EVA"),material_raw:"EVA 406"},{...sample("eva2","2","A1","EVA"),material_raw:"EVA 806"}];
  const evaStyles=[...specimenStylesById(eva).values()];
  assert.notEqual(`${evaStyles[0].dash}:${evaStyles[0].marker}`,`${evaStyles[1].dash}:${evaStyles[1].marker}`);
});
test("a uniform ribbon label can be hidden without merging any analysis groups",()=>{
  const cells=[sample("a","1"),sample("b","2")];
  assert.equal(ribbonLabelsDistinguish(cells,"auto"),false);
  assert.equal(ribbonLabelsDistinguish(cells,"always"),true);
  assert.equal(ribbonLabelsDistinguish([cells[0],{...cells[1],ribbon_raw:"custom ribbon"}],"auto"),true);
});
test("overview ribbons do not decorate unrelated individual formulations and PDMS retains Ag/Cu",()=>{
  const cells=[sample("eva","2","9","EVA"),sample("poe","2","9","POE-1 / Mitsui"),
    {...sample("pdms-cu","1","S2","Silicone / PDMS"),ribbon_raw:"3M-3007"},
    {...sample("pdms-ag","1","S3","Silicone / PDMS"),electrode:"Ag"}];
  cells[0].material_raw="EVA 806";
  const pdms=trend(cells[2]);
  pdms.points.forEach(point=>{point.n=2;delete point.selectedLabel;point.members.push({...point.members[0],sampleUid:cells[3].sample_uid});});
  const series=[trend(cells[0]),trend(cells[1]),pdms];
  series[0].points.forEach(point=>delete point.selectedLabel);
  const before=JSON.stringify(series);
  const out=publicationTrendSeries(series,cells,defaults);
  assert.ok(out.every(item=>!item.exportLabel?.includes("Ruban standard")));
  assert.equal(describeSeriesSelection(out[0].points),"Échantillon individuel");
  assert.equal(legendElectrodesByKey(out,new Map(cells.map(cell=>[cell.sample_uid,cell.electrode]))).get(pdms.id),"Électrodes Ag / Cu");
  out.forEach((item,i)=>assert.equal(item.points,series[i].points));
  assert.equal(JSON.stringify(series),before);
  assert.match(publicationTrendSeries(series,cells,{...defaults,ribbonLabels:"always"})[0].exportLabel!,/Ruban standard/);
});
test("ribbons remain explicit when separate curves compare them within a formulation",()=>{
  const cells=[sample("a","1"),{...sample("b","2"),ribbon_raw:"3M-3007"}];
  const out=publicationTrendSeries(cells.map(cell=>trend(cell)),cells,defaults);
  assert.match(out[0].exportLabel!,/Ruban standard/);
  assert.match(out[1].exportLabel!,/Ruban 3M-3007/);
});
test("n=1 cohorts are only called individual when the same recorded cell contributes throughout",()=>{
  const points=trend(sample("eva","2","9","EVA")).points;
  points.forEach(point=>delete point.selectedLabel);
  assert.equal(describeSeriesSelection(points),"Échantillon individuel");
  points[1].members[0].sampleUid="another-cell";
  assert.equal(describeSeriesSelection(points),"n = 1");
  points[1].n=4;
  assert.equal(describeSeriesSelection(points),"n = 1–4");
});
test("long legend text wraps without losing identities; larger fonts reduce automatic column count",()=>{
  const label="TPO-2 — lot TPO_SL · cellule 2 · électrode Ag · échantillon individuel";
  assert.equal(wrapFigureText(label,180,16).join(" "),label);
  assert.ok(wrapFigureText(label,180,16).length>1);
  assert.equal(publicationLegendColumns(900,7,defaults),3);
  assert.equal(publicationLegendColumns(900,7,{...defaults,textSize:"large"}),2);
});
test("persistent-zero note describes recorded terminal values, not an instrumental fault",()=>{
  const cell=sample("a","4","TPO_SL","TPO-1 / DNP-CVF");
  const [note]=persistentZeroNotes([trend(cell,[100,0,0,0])],[cell]);
  assert.match(note,/TPO-1 — lot TPO_SL · cellule 4/);
  assert.match(note,/3 médianes journalières nulles/);
  assert.match(note,/cause n’est pas établie/);
  assert.equal(persistentZeroNotes([trend(cell,[100,0,0,90])],[cell]).length,0);
});
test("trend controls expose publication options and include every observed member in the auto scale",()=>{
  const cell=sample("a","1"); const series=trend(cell,[100,90]);
  series.points.forEach(point=>delete point.selectedLabel);
  series.points[1].n=2;
  series.points[1].members.push({...series.points[1].members[0],sampleUid:"b",value:170});
  const html=renderToStaticMarkup(createElement(TrendChart,{series:[series],xUnit:"cycles",yUnit:"% of reference"}));
  assert.match(html,/Publication settings/); assert.match(html,/Start Y at 0/);
  assert.doesNotMatch(html,/values or intervals clipped/);
  const scale=html.match(/Auto Y: ([\d,]+)–([\d,]+) % of reference/)!;
  assert.ok(scale); assert.ok(Number(scale[1].replace(",","."))<=90); assert.ok(Number(scale[2].replace(",","."))>=170);
});
